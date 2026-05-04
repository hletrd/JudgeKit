import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser, unauthorized, forbidden, csrfForbidden } from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { importDatabase } from "@/lib/db/import";
import { validateExport, type JudgeKitExport } from "@/lib/db/export";
import { MAX_IMPORT_BYTES, readJsonBodyWithLimit, readUploadedJsonFileWithLimit } from "@/lib/db/import-transfer";
import { recordAuditEvent } from "@/lib/audit/events";
import { verifyAndRehashPassword } from "@/lib/security/password-hash";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

/** Zod schema for the JSON body import path: { password, data? } */
const jsonImportBodySchema = z.object({
  password: z.string().min(1, "passwordRequired"),
  data: z.unknown().optional(),
});

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

    const rateLimitError = await consumeApiRateLimit(request, "admin:migrate-import");
    if (rateLimitError) return rateLimitError;

    // Require password re-confirmation before destructive import (matches /admin/restore)
    const contentType = request.headers.get("content-type");
    let password: string | null = null;

    if (contentType?.includes("multipart/form-data")) {
      const formData = await request.formData();
      password = formData.get("password") as string | null;
      const file = formData.get("file") as File | null;

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

      if (!file) {
        return NextResponse.json({ error: "noFileProvided" }, { status: 400 });
      }
      if (file.size > MAX_IMPORT_BYTES) {
        return NextResponse.json({ error: "fileTooLarge" }, { status: 400 });
      }
      let data: JudgeKitExport;
      try {
        data = await readUploadedJsonFileWithLimit<JudgeKitExport>(file);
      } catch (error) {
        if (error instanceof Error && error.message === "fileTooLarge") {
          return NextResponse.json({ error: "fileTooLarge" }, { status: 400 });
        }
        return NextResponse.json({ error: "invalidJson" }, { status: 400 });
      }

      const errors = validateExport(data);
      if (errors.length > 0) {
        return NextResponse.json({ error: "invalidExport", details: errors }, { status: 400 });
      }

      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "system_settings.data_imported",
        resourceType: "system_settings",
        resourceId: "database",
        resourceLabel: "Database import",
        summary: `Importing database from ${data.sourceDialect} export (${data.exportedAt})`,
        request,
      });

      const result = await importDatabase(data);

      if (!result.success) {
        return NextResponse.json({
          error: "importFailed",
          details: result.errors,
          partial: result.tableResults,
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        tablesImported: result.tablesImported,
        totalRowsImported: result.totalRowsImported,
        tableResults: result.tableResults,
      });
    }

    // JSON body path — DEPRECATED: password included in body as { password, data }
    // Prefer multipart/form-data which keeps the password out of JSON request bodies
    // that may be logged by middleware or reverse proxies.
    logger.warn({ userId: user.id }, "[migrate-import] JSON body path is deprecated — use multipart/form-data instead");
    let rawJsonBody: unknown;
    try {
      rawJsonBody = await readJsonBodyWithLimit(request);
    } catch (error) {
      if (error instanceof Error && error.message === "fileTooLarge") {
        return NextResponse.json({ error: "fileTooLarge" }, { status: 400 });
      }
      if (error instanceof Error && error.message === "invalidJson") {
        return NextResponse.json({ error: "invalidJson" }, { status: 400 });
      }
      throw error;
    }

    // Validate JSON body structure with Zod instead of unsafe casts
    const parsedBody = jsonImportBodySchema.safeParse(rawJsonBody);
    if (!parsedBody.success) {
      return NextResponse.json({ error: "passwordRequired" }, { status: 400 });
    }

    const jsonPassword = parsedBody.data.password;

    const [dbUser] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!dbUser?.passwordHash) {
      return NextResponse.json({ error: "authenticationFailed" }, { status: 403 });
    }

    const { valid } = await verifyAndRehashPassword(jsonPassword, user.id, dbUser.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "invalidPassword" }, { status: 403 });
    }

    // Extract the actual export data, stripping the password field.
    // The export payload is validated by validateExport() below, which checks
    // the structural integrity (required fields, table shapes, etc.) before
    // the data reaches importDatabase(). The intermediate cast is therefore
    // guarded by that validation — do NOT remove the validateExport() call
    // without replacing it with equivalent structural validation (e.g., a
    // full Zod schema for JudgeKitExport). See C11-1.
    if (typeof rawJsonBody !== "object" || rawJsonBody === null || Array.isArray(rawJsonBody)) {
      return NextResponse.json({ error: "invalidJson" }, { status: 400 });
    }
    const rawRecord = rawJsonBody as Record<string, unknown>;
    const { password: _, data: _data, ...restFields } = rawRecord;
    // parsedBody.data.data comes from z.unknown().optional() — no structural
    // guarantee. The cast to JudgeKitExport is safe ONLY because validateExport()
    // below verifies the structure. If data is absent, fall back to the rest
    // of the body (legacy format where the export was the top-level object).
    const unvalidatedData = parsedBody.data.data ?? restFields;
    const errors = validateExport(unvalidatedData);
    if (errors.length > 0) {
      return NextResponse.json({ error: "invalidExport", details: errors }, { status: 400 });
    }
    // After validateExport() passes, the data conforms to JudgeKitExport.
    // Cast is safe because validateExport verified the structure.
    const data = unvalidatedData as JudgeKitExport;

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "system_settings.data_imported",
      resourceType: "system_settings",
      resourceId: "database",
      resourceLabel: "Database import",
      summary: `Importing database from ${data.sourceDialect} export (${data.exportedAt})`,
      request,
    });

    const result = await importDatabase(data);

    if (!result.success) {
      return NextResponse.json({
        error: "importFailed",
        details: result.errors,
        partial: result.tableResults,
      }, { status: 500, headers: { "Deprecation": "true", "Sunset": "Sun, 01 Nov 2026 00:00:00 GMT" } });
    }

    return NextResponse.json({
      success: true,
      tablesImported: result.tablesImported,
      totalRowsImported: result.totalRowsImported,
      tableResults: result.tableResults,
    }, { headers: { "Deprecation": "true", "Sunset": "Sun, 01 Nov 2026 00:00:00 GMT" } });
  } catch (error) {
    logger.error({ err: error }, "Database import error");
    return NextResponse.json({ error: "importFailed" }, { status: 500 });
  }
}
