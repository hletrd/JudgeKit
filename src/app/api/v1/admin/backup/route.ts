// Database backup route: POST with password re-confirmation for security.
// Returns either a JSON export or a ZIP bundle containing `database.json`
// plus uploaded files when `includeFiles=true`.
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, unauthorized, forbidden, csrfForbidden } from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import { verifyPassword } from "@/lib/security/password-hash";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { streamDatabaseExport } from "@/lib/db/export";
import { streamBackupWithFiles } from "@/lib/db/export-with-files";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    // Skip CSRF for API key auth (no cookies involved)
    const isApiKeyAuth = "_apiKeyAuth" in user;
    if (!isApiKeyAuth) {
      const csrfError = csrfForbidden(request);
      if (csrfError) return csrfError;
    }

    const caps = await resolveCapabilities(user.role);
    if (!caps.has("system.backup")) return forbidden();

    const rateLimitResponse = await consumeApiRateLimit(request, "admin:backup");
    if (rateLimitResponse) return rateLimitResponse;

    // Require password re-confirmation
    let body: { password?: string };
    try {
      body = await request.json();
    } catch (err) {
      logger.warn({ err }, "[backup] failed to parse request body");
      return NextResponse.json({ error: "invalidRequestBody" }, { status: 400 });
    }

    if (!body.password || typeof body.password !== "string") {
      return NextResponse.json({ error: "passwordRequired" }, { status: 400 });
    }

    // Verify password against stored hash
    const [dbUser] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!dbUser?.passwordHash) {
      return NextResponse.json({ error: "authenticationFailed" }, { status: 403 });
    }

    const { valid } = await verifyPassword(body.password, dbUser.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "invalidPassword" }, { status: 403 });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const includeFiles = new URL(request.url).searchParams.get("includeFiles") === "true";

    const filename = includeFiles
      ? `judgekit-backup-${timestamp}.zip`
      : `judgekit-backup-${timestamp}.json`;

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "system_settings.backup_downloaded",
      resourceType: "system_settings",
      resourceId: "database",
      resourceLabel: "Database backup",
      summary: includeFiles
        ? "Downloaded PostgreSQL backup with file uploads as ZIP"
        : "Downloaded PostgreSQL backup as a streamed JSON export",
      request,
    });

    if (includeFiles) {
      const body = await streamBackupWithFiles(request.signal);
      return new Response(body, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return new Response(streamDatabaseExport({ signal: request.signal }), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Database backup error");
    return NextResponse.json({ error: "backupFailed" }, { status: 500 });
  }
}
