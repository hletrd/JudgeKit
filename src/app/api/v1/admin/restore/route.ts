// Database restore route: JSON or ZIP import for PostgreSQL
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, unauthorized, forbidden, csrfForbidden } from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { recordAuditEventDurable } from "@/lib/audit/events";
import { verifyAndRehashPassword } from "@/lib/security/password-hash";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { importDatabase } from "@/lib/db/import";
import { isSanitizedExport, validateExport, type JudgeKitExport } from "@/lib/db/export";
import { MAX_IMPORT_BYTES, readUploadedJsonFileWithLimit } from "@/lib/db/import-transfer";
import { parseBackupZip, restoreParsedBackupFiles } from "@/lib/db/export-with-files";
import { takePreRestoreSnapshot } from "@/lib/db/pre-restore-snapshot";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    // Skip CSRF for API key auth (no cookies involved)
    const isApiKeyAuth = "_apiKeyAuth" in user;
    if (!isApiKeyAuth) {
      const csrfError = await csrfForbidden(request);
      if (csrfError) return csrfError;
    }

    const caps = await resolveCapabilities(user.role);
    if (!caps.has("system.backup")) return forbidden();

    const rateLimitError = await consumeApiRateLimit(request, "admin:restore");
    if (rateLimitError) return rateLimitError;

    const formData = await request.formData();
    const fileValue = formData.get("file");
    const file = fileValue instanceof File ? fileValue : null;
    const passwordValue = formData.get("password");
    const password = typeof passwordValue === "string" ? passwordValue : null;

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

    const { valid } = await verifyAndRehashPassword(password, user.id, dbUser.passwordHash);
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

    // Detect whether this is a ZIP archive (new format) or plain JSON (legacy).
    // Rely only on the file name extension; file.type is client-controlled and
    // can be spoofed via the multipart Content-Type header.
    const isZipFile = file.name?.endsWith(".zip");

    let data: JudgeKitExport;
    let filesRestored = 0;
    let pendingUploadedFiles: Array<{ storedName: string; buffer: Buffer }> = [];

    if (isZipFile) {
      // ZIP archive: extract database.json + uploaded files
      const arrayBuffer = await file.arrayBuffer();
      const zipBuffer = Buffer.from(arrayBuffer);

      try {
        const result = await parseBackupZip(zipBuffer);
        data = result.dbExport;
        pendingUploadedFiles = result.uploads;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "invalidBackupManifest" || error.message === "backupIntegrityMismatch")
        ) {
          return NextResponse.json({ error: "invalidBackupIntegrity" }, { status: 400 });
        }
        if (
          error instanceof Error &&
          (error.message === "backupZipTooLarge" || error.message === "backupZipSizeUnknown")
        ) {
          return NextResponse.json({ error: "fileTooLarge" }, { status: 400 });
        }
        throw error;
      }
    } else {
      // Legacy JSON format
      const isJsonFile = file.name?.endsWith(".json");
      if (!isJsonFile) {
        return NextResponse.json(
          { error: "unsupportedFileFormat" },
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
        },
        { status: 400 }
      );
    }

    // Take a server-side full-fidelity snapshot of the live DB before any
    // destructive change. importDatabase() truncates and re-inserts every
    // table inside one transaction, so a partial mid-flight failure rolls
    // back cleanly — but a successful import from a corrupt or wrong-version
    // backup permanently replaces production data with no automatic
    // rollback path. The snapshot below gives operators an emergency restore
    // artifact in ~/data/pre-restore-snapshots/ even if the imported file
    // turns out to be wrong. The 5 most recent snapshots are retained;
    // older ones are pruned best-effort.
    const preSnapshotPath = await takePreRestoreSnapshot(user.id);

    // The snapshot is the operator's only emergency rollback artifact. If it
    // failed (disk full / I/O error / read-only mount → null), do NOT proceed
    // to the destructive import — production data would be replaced with no
    // recovery path. ALLOW_UNSNAPSHOTTED_RESTORE=1 is the documented break-glass
    // for the disk-full recovery case.
    if (preSnapshotPath === null && process.env.ALLOW_UNSNAPSHOTTED_RESTORE !== "1") {
      logger.error(
        "[restore] Pre-restore snapshot failed; aborting before destructive import (set ALLOW_UNSNAPSHOTTED_RESTORE=1 to override)",
      );
      return NextResponse.json({ error: "preRestoreSnapshotFailed" }, { status: 500 });
    }

    const result = await importDatabase(data);

    if (!result.success || result.errors.length > 0) {
      return NextResponse.json({
        error: "restoreFailed",
        details: result.errors,
        partial: result.tableResults,
        preRestoreSnapshotPath: preSnapshotPath,
      }, { status: 500 });
    }

    // Restore uploaded files AFTER the DB transaction commits. If this phase
    // fails, the DB already references the new backup's uploads — record a
    // DURABLE failure audit so the integrity trail reflects reality, then
    // surface the snapshot path the operator needs for manual rollback.
    if (isZipFile) {
      try {
        filesRestored = await restoreParsedBackupFiles(pendingUploadedFiles);
      } catch (err) {
        logger.error({ err }, "[restore] restoreParsedBackupFiles failed after DB commit");
        const missingFiles =
          err instanceof Error && Array.isArray((err as Error & { missing?: unknown }).missing)
            ? ((err as Error & { missing: string[] }).missing)
            : undefined;
        await recordAuditEventDurable({
          actorId: user.id,
          actorRole: user.role,
          action: "system_settings.database_restore_files_failed",
          resourceType: "system_settings",
          resourceId: "database",
          resourceLabel: "Database restore (files failed)",
          summary: `Restore file-write phase failed after DB commit (source: ${data.sourceDialect})`,
          details: {
            preRestoreSnapshotPath: preSnapshotPath,
            error: err instanceof Error ? err.message : String(err),
            missingFiles: missingFiles ?? null,
          },
          request,
        });
        return NextResponse.json(
          {
            error: "restoreFailed",
            details: ["fileRestoreFailed"],
            missingFiles,
            preRestoreSnapshotPath: preSnapshotPath,
          },
          { status: 500 },
        );
      }
    }

    // Record the restore audit AFTER `importDatabase` commits AND file
    // restoration succeeds. Use the DURABLE helper (awaited insert) — a DB
    // restore is the canonical low-frequency high-stakes event, and the
    // buffered recordAuditEvent would be lost on a SIGKILL/OOM in its 5s flush
    // window. recordAuditEventDurable never throws (falls back to buffer).
    await recordAuditEventDurable({
      actorId: user.id,
      actorRole: user.role,
      action: "system_settings.database_restored",
      resourceType: "system_settings",
      resourceId: "database",
      resourceLabel: "Database restore",
      summary: isZipFile
        ? `Restored from ZIP backup (source: ${data.sourceDialect}, ${filesRestored} files written, ${(file.size / 1024 / 1024).toFixed(1)} MB)`
        : `Restored from JSON export (source: ${data.sourceDialect}, ${(file.size / 1024 / 1024).toFixed(1)} MB)`,
      details: { preRestoreSnapshotPath: preSnapshotPath, skippedTables: result.skippedTables },
      request,
    });

    return NextResponse.json({
      success: true,
      tablesImported: result.tablesImported,
      totalRowsImported: result.totalRowsImported,
      filesRestored: isZipFile ? filesRestored : undefined,
      skippedTables: result.skippedTables,
      preRestoreSnapshotPath: preSnapshotPath,
    });
  } catch (error) {
    logger.error({ err: error }, "Database restore error");
    return NextResponse.json({ error: "restoreFailed" }, { status: 500 });
  }
}
