import { NextRequest, NextResponse } from "next/server";
import { getApiUser, unauthorized, forbidden, csrfForbidden } from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { streamDatabaseExport } from "@/lib/db/export";
import { recordAuditEvent } from "@/lib/audit/events";
import { verifyAndRehashPassword } from "@/lib/security/password-hash";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { contentDispositionAttachment } from "@/lib/http/content-disposition";
import { getDbNowUncached } from "@/lib/db-time";

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

    const rateLimitResponse = await consumeApiRateLimit(request, "admin:migrate-export");
    if (rateLimitResponse) return rateLimitResponse;

    let body: { password?: string };
    try {
      body = await request.json();
    } catch (err) {
      logger.warn({ err }, "[export] failed to parse request body");
      return NextResponse.json({ error: "invalidRequestBody" }, { status: 400 });
    }
    const password = body?.password;
    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "passwordRequired" }, { status: 400 });
    }

    const [dbUser] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!dbUser?.passwordHash) {
      return NextResponse.json({ error: "authenticationFailed" }, { status: 403 });
    }

    const { valid } = await verifyAndRehashPassword(password, user.id, dbUser.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "invalidPassword" }, { status: 403 });
    }

    // Portable exports are sanitized by default — sensitive tokens/secrets
    // are nulled out.  Pass ?full=true to get a full-fidelity export (same
    // as the dedicated backup route).
    const url = new URL(request.url);
    const wantFull = url.searchParams.get("full") === "true";

    // Use DB server time for the export filename to match the backup route pattern
    const dbNow = await getDbNowUncached();
    const timestamp = dbNow.toISOString().replace(/[:.]/g, "-");
    const filename = `judgekit-export-${timestamp}.json`;

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "system_settings.data_exported",
      resourceType: "system_settings",
      resourceId: "database",
      resourceLabel: "Database export",
      summary: `Exported database as streamed JSON (${filename}, ${wantFull ? "full-fidelity" : "sanitized"})`,
      request,
    });

    return new Response(streamDatabaseExport({ signal: request.signal, sanitize: !wantFull, dbNow }), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": contentDispositionAttachment(filename.replace(/\.json$/, ""), ".json"),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Database export error");
    return NextResponse.json({ error: "exportFailed" }, { status: 500 });
  }
}
