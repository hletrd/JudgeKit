import { NextRequest, NextResponse } from "next/server";
import { getApiUser, unauthorized, forbidden, csrfForbidden } from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { importDatabase } from "@/lib/db/import";
import { validateExport, type JudgeKitExport } from "@/lib/db/export";
import { MAX_IMPORT_BYTES, readJsonBodyWithLimit, readUploadedJsonFileWithLimit } from "@/lib/db/import-transfer";
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

      const { valid } = await verifyPassword(password, dbUser.passwordHash);
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

    // JSON body path — password included in body as { password, data }
    let jsonBody: { password?: string; data?: JudgeKitExport };
    try {
      jsonBody = await readJsonBodyWithLimit(request) as unknown as { password?: string; data?: JudgeKitExport };
    } catch (error) {
      if (error instanceof Error && error.message === "fileTooLarge") {
        return NextResponse.json({ error: "fileTooLarge" }, { status: 400 });
      }
      if (error instanceof Error && error.message === "invalidJson") {
        return NextResponse.json({ error: "invalidJson" }, { status: 400 });
      }
      throw error;
    }

    // For backwards compatibility, accept either { password, data: {...} } or flat export with password field
    const jsonPassword = (jsonBody as Record<string, unknown>).password as string | undefined;
    if (!jsonPassword || typeof jsonPassword !== "string") {
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

    const { valid } = await verifyPassword(jsonPassword, dbUser.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "invalidPassword" }, { status: 403 });
    }

    // Extract the actual export data, stripping the password field
    const jsonBodyRecord = { ...(jsonBody as Record<string, unknown>) };
    const nestedData = jsonBodyRecord.data;
    delete jsonBodyRecord.password;
    delete jsonBodyRecord.data;
    const data: JudgeKitExport = nestedData
      ? nestedData as JudgeKitExport
      : jsonBodyRecord as unknown as JudgeKitExport;

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
  } catch (error) {
    logger.error({ err: error }, "Database import error");
    return NextResponse.json({ error: "importFailed" }, { status: 500 });
  }
}
