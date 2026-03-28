// File upload route: not migrated to createApiHandler due to formData parsing and raw Response
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, unauthorized, forbidden, csrfForbidden } from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { recordAuditEvent } from "@/lib/audit/events";
import { logger } from "@/lib/logger";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

function getDbPath(): string {
  return process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(process.cwd(), "data", "judge.db");
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();
    if (user.role !== "super_admin") return forbidden();

    const rateLimitError = consumeApiRateLimit(request, "admin:restore");
    if (rateLimitError) return rateLimitError;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "noFileProvided" }, { status: 400 });
    }

    // Validate file size (max 100MB)
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: "fileTooLarge" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate it's a SQLite file (magic bytes: "SQLite format 3\0")
    const SQLITE_MAGIC = Buffer.from("SQLite format 3\0", "ascii");
    if (buffer.length < 16 || !buffer.subarray(0, 16).equals(SQLITE_MAGIC)) {
      return NextResponse.json({ error: "invalidSqliteFile" }, { status: 400 });
    }

    const dbPath = getDbPath();

    // Create automatic backup before restore using WAL-safe backup API
    const backupTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${dbPath}.pre-restore-${backupTimestamp}`;

    if (existsSync(dbPath)) {
      const { sqlite: sqliteConn } = await import("@/lib/db");
      try {
        await sqliteConn.backup(backupPath);
      } catch {
        // Fallback to file copy if backup API fails
        await fs.copyFile(dbPath, backupPath);
      }
    }

    logger.info({ backupPath }, "Pre-restore backup saved");

    // Record audit BEFORE closing the connection (audit writes to current DB)
    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "system_settings.database_restored",
      resourceType: "system_settings",
      resourceId: "database",
      resourceLabel: "Database restore",
      summary: `Restored database from upload (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Pre-restore backup saved.`,
      request,
    });

    // Close the live SQLite connection before overwriting the file
    const { sqlite: sqliteConn2 } = await import("@/lib/db");
    try {
      sqliteConn2.close();
    } catch (closeErr) {
      logger.warn({ err: closeErr }, "Failed to close SQLite connection before restore");
    }

    // Remove orphaned WAL and SHM files from the old database
    for (const ext of ["-wal", "-shm"]) {
      await fs.unlink(dbPath + ext).catch(() => {});
    }

    // Write the new database file
    const tempPath = dbPath + ".restore-tmp";
    await fs.writeFile(tempPath, buffer);
    await fs.rename(tempPath, dbPath);

    // Schedule process restart after response is sent
    setTimeout(() => {
      logger.info("Restarting process after database restore");
      process.exit(0);
    }, 500);

    return NextResponse.json({
      success: true,
      message: "Database restored. The server will restart automatically.",
    });
  } catch (error) {
    logger.error({ err: error }, "Database restore error");
    return NextResponse.json({ error: "restoreFailed" }, { status: 500 });
  }
}
