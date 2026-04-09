import { NextRequest, NextResponse } from "next/server";
import { getApiUser, unauthorized, forbidden, csrfForbidden } from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { streamDatabaseExport } from "@/lib/db/export";
import { recordAuditEvent } from "@/lib/audit/events";
import { verifyPassword } from "@/lib/security/password-hash";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("system.backup")) return forbidden();

    const rateLimitResponse = await consumeApiRateLimit(request, "admin:migrate-export");
    if (rateLimitResponse) return rateLimitResponse;

    let body: { password?: string };
    try {
      body = await request.json();
    } catch {
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

    const { valid } = await verifyPassword(password, dbUser.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "invalidPassword" }, { status: 403 });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `judgekit-export-${timestamp}.json`;

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "system_settings.data_exported",
      resourceType: "system_settings",
      resourceId: "database",
      resourceLabel: "Database export",
      summary: `Exported database as streamed JSON (${filename})`,
      request,
    });

    return new Response(streamDatabaseExport({ signal: request.signal }), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Database export error");
    return NextResponse.json({ error: "exportFailed" }, { status: 500 });
  }
}
