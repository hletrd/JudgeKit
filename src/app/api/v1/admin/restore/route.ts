// Database restore route: JSON or ZIP import for PostgreSQL
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
import { importDatabase } from "@/lib/db/import";
import { isSanitizedExport, validateExport, type JudgeKitExport } from "@/lib/db/export";
import { MAX_IMPORT_BYTES, readUploadedJsonFileWithLimit } from "@/lib/db/import-transfer";
import { restoreFilesFromZip } from "@/lib/db/export-with-files";

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

    const rateLimitError = await consumeApiRateLimit(request, "admin:restore");
    if (rateLimitError) return rateLimitError;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const password = formData.get("password") as string | null;

    if (!password || typeof password !== "string") {
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

    const { valid } = await verifyPassword(password, dbUser.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "invalidPassword" }, { status: 403 });
    }

    if (!file) {
      return NextResponse.json({ error: "noFileProvided" }, { status: 400 });
    }

    // Validate file size before parsing
    if (file.size > MAX_IMPORT_BYTES) {
      return NextResponse.json({ error: "fileTooLarge" }, { status: 400 });
    }

    // Detect whether this is a ZIP archive (new format) or plain JSON (legacy)
    const isZipFile =
      file.name?.endsWith(".zip") ||
      file.type === "application/zip" ||
      file.type === "application/x-zip-compressed";

    let data: JudgeKitExport;
    let filesRestored = 0;

    if (isZipFile) {
      // ZIP archive: extract database.json + uploaded files
      const arrayBuffer = await file.arrayBuffer();
      const zipBuffer = Buffer.from(arrayBuffer);

      try {
        const result = await restoreFilesFromZip(zipBuffer);
        data = result.dbExport;
        filesRestored = result.filesRestored;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "invalidBackupManifest" || error.message === "backupIntegrityMismatch")
        ) {
          return NextResponse.json({ error: "invalidBackupIntegrity" }, { status: 400 });
        }
        throw error;
      }
    } else {
      // Legacy JSON format
      const isJsonFile = file.name?.endsWith(".json") || file.type === "application/json";
      if (!isJsonFile) {
        return NextResponse.json(
          { error: "unsupportedFileFormat", message: "Only JSON export files or ZIP backup archives are supported." },
          { status: 400 }
        );
      }

      try {
        data = await readUploadedJsonFileWithLimit<JudgeKitExport>(file);
      } catch (error) {
        if (error instanceof Error && error.message === "fileTooLarge") {
          return NextResponse.json({ error: "fileTooLarge" }, { status: 400 });
        }
        return NextResponse.json({ error: "invalidJsonFile" }, { status: 400 });
      }
    }

    const errors = validateExport(data);
    if (errors.length > 0) {
      return NextResponse.json({ error: "invalidExport", details: errors }, { status: 400 });
    }

    if (isSanitizedExport(data)) {
      return NextResponse.json(
        {
          error: "sanitizedExportNotRestorable",
          message: "Portable sanitized exports are for sharing and validation only. Restore from a full-fidelity backup instead.",
        },
        { status: 400 }
      );
    }

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "system_settings.database_restored",
      resourceType: "system_settings",
      resourceId: "database",
      resourceLabel: "Database restore",
      summary: isZipFile
        ? `Restoring from ZIP backup (source: ${data.sourceDialect}, ${filesRestored} files, ${(file.size / 1024 / 1024).toFixed(1)} MB)`
        : `Restoring from JSON export (source: ${data.sourceDialect}, ${(file.size / 1024 / 1024).toFixed(1)} MB)`,
      request,
    });

    const result = await importDatabase(data);

    if (!result.success) {
      return NextResponse.json({
        error: "restoreFailed",
        details: result.errors,
        partial: result.tableResults,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Database restored from backup.",
      tablesImported: result.tablesImported,
      totalRowsImported: result.totalRowsImported,
      filesRestored: isZipFile ? filesRestored : undefined,
    });
  } catch (error) {
    logger.error({ err: error }, "Database restore error");
    return NextResponse.json({ error: "restoreFailed" }, { status: 500 });
  }
}
