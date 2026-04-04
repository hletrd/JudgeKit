// Database backup route: POST with password re-confirmation for security
// Exports the database as portable JSON
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, unauthorized, forbidden, csrfForbidden } from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { recordAuditEvent } from "@/lib/audit/events";
import { verifyPassword } from "@/lib/security/password-hash";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { exportDatabase } from "@/lib/db/export";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();
    if (user.role !== "super_admin") return forbidden();

    const rateLimitResponse = await consumeApiRateLimit(request, "admin:backup");
    if (rateLimitResponse) return rateLimitResponse;

    // Require password re-confirmation
    let body: { password?: string };
    try {
      body = await request.json();
    } catch {
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

    // Export as portable JSON
    const data = await exportDatabase();
    const json = JSON.stringify(data);
    const filename = `judgekit-backup-${timestamp}.json`;

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "system_settings.backup_downloaded",
      resourceType: "system_settings",
      resourceId: "database",
      resourceLabel: "Database backup",
      summary: `Downloaded PostgreSQL backup as JSON (${(json.length / 1024 / 1024).toFixed(1)} MB, ${Object.values(data.tables).reduce((s, t) => s + t.rowCount, 0)} rows)`,
      request,
    });

    return new Response(json, {
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
