// File download route: not migrated to createApiHandler due to raw Response (binary file download)
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, unauthorized, forbidden, isAdmin } from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { recordAuditEvent } from "@/lib/audit/events";
import { logger } from "@/lib/logger";
import { sqlite } from "@/lib/db";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";

export const dynamic = "force-dynamic";

function getDbPath(): string {
  return process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(process.cwd(), "data", "judge.db");
}

export async function GET(request: NextRequest) {
  let backupPath: string | null = null;
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();
    if (!isAdmin(user.role)) return forbidden();

    const rateLimitResponse = consumeApiRateLimit(request, "admin:backup");
    if (rateLimitResponse) return rateLimitResponse;

    const dbPath = getDbPath();

    if (!existsSync(dbPath)) {
      return NextResponse.json({ error: "databaseNotFound" }, { status: 404 });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `judgekit-backup-${timestamp}.sqlite`;

    // Use SQLite's backup API for a WAL-consistent snapshot
    backupPath = path.join(os.tmpdir(), filename);
    await sqlite.backup(backupPath);

    const fileBuffer = await fs.readFile(backupPath);

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "system_settings.backup_downloaded",
      resourceType: "system_settings",
      resourceId: "database",
      resourceLabel: "Database backup",
      summary: `Downloaded database backup (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB)`,
      request,
    });

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Database backup error");
    return NextResponse.json({ error: "backupFailed" }, { status: 500 });
  } finally {
    // Clean up temp backup file
    if (backupPath) {
      fs.unlink(backupPath).catch(() => {});
    }
  }
}
