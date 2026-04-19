import { db } from "@/lib/db";
import { auditEvents, loginEvents } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { DATA_RETENTION_DAYS, DATA_RETENTION_LEGAL_HOLD, getRetentionCutoff } from "@/lib/data-retention";
import { logger } from "@/lib/logger";

const BATCH_SIZE = 5000;
const BATCH_DELAY_MS = 100;

/**
 * Clean up old audit and login events based on the canonical retention config.
 *
 * @deprecated This function is superseded by the in-process pruners in
 * `audit/events.ts` (pruneOldAuditEvents) and `data-retention-maintenance.ts`
 * (pruneLoginEvents). Those pruners run on 24-hour intervals, use the same
 * canonical `DATA_RETENTION_DAYS` config, respect `DATA_RETENTION_LEGAL_HOLD`,
 * and cover all six retention categories. This function is kept for the
 * `/api/internal/cleanup` cron endpoint, which may be referenced by external
 * cron jobs. New deployments should rely on the in-process pruners instead.
 */
export async function cleanupOldEvents(): Promise<{
  auditDeleted: number;
  loginDeleted: number;
}> {
  // Respect legal hold — do not delete any data while a legal hold is active.
  // This matches the behavior of the in-process pruners in audit/events.ts
  // and data-retention-maintenance.ts.
  if (DATA_RETENTION_LEGAL_HOLD) {
    logger.info("Data retention legal hold is active — skipping cleanup of old events");
    return { auditDeleted: 0, loginDeleted: 0 };
  }

  const auditCutoff = getRetentionCutoff(DATA_RETENTION_DAYS.auditEvents);
  const loginCutoff = getRetentionCutoff(DATA_RETENTION_DAYS.loginEvents);

  let auditDeleted = 0;
  let loginDeleted = 0;

  // Batch DELETE to avoid long-running locks and WAL bloat
  while (true) {
    const auditResult = await db.execute(
      sql`DELETE FROM ${auditEvents} WHERE ctid IN (SELECT ctid FROM ${auditEvents} WHERE ${auditEvents.createdAt} < ${auditCutoff} LIMIT ${BATCH_SIZE})`
    );
    const deleted = Number(auditResult.rowCount ?? 0);
    auditDeleted += deleted;
    if (deleted < BATCH_SIZE) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  while (true) {
    const loginResult = await db.execute(
      sql`DELETE FROM ${loginEvents} WHERE ctid IN (SELECT ctid FROM ${loginEvents} WHERE ${loginEvents.createdAt} < ${loginCutoff} LIMIT ${BATCH_SIZE})`
    );
    const deleted = Number(loginResult.rowCount ?? 0);
    loginDeleted += deleted;
    if (deleted < BATCH_SIZE) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  return { auditDeleted, loginDeleted };
}
