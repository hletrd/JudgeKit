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

    // Create automatic backup before restore
    const backupTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${dbPath}.pre-restore-${backupTimestamp}`;

    if (existsSync(dbPath)) {
      await fs.copyFile(dbPath, backupPath);
    }

    // Write the uploaded file
    await fs.writeFile(dbPath, buffer);

    logger.info({ backupPath }, "Pre-restore backup saved");

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

    return NextResponse.json({
      success: true,
      message: "Database restored. Please restart the application.",
    });
  } catch (error) {
    logger.error({ err: error }, "Database restore error");
    return NextResponse.json({ error: "restoreFailed" }, { status: 500 });
  }
}
