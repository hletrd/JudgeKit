import { db } from "@/lib/db";
import { auditEvents, loginEvents } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

const RETENTION_DAYS = Math.max(1, parseInt(process.env.AUDIT_RETENTION_DAYS ?? "90", 10) || 90);
const BATCH_SIZE = 5000;
const BATCH_DELAY_MS = 100;

export async function cleanupOldEvents(): Promise<{
  auditDeleted: number;
  loginDeleted: number;
}> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  let auditDeleted = 0;
  let loginDeleted = 0;

  // Batch DELETE to avoid long-running locks and WAL bloat
  while (true) {
    const auditResult = await db.execute(
      sql`DELETE FROM ${auditEvents} WHERE ${auditEvents.createdAt} < ${cutoff} LIMIT ${BATCH_SIZE}`
    );
    const deleted = Number(auditResult.rowCount ?? 0);
    auditDeleted += deleted;
    if (deleted < BATCH_SIZE) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  while (true) {
    const loginResult = await db.execute(
      sql`DELETE FROM ${loginEvents} WHERE ${loginEvents.createdAt} < ${cutoff} LIMIT ${BATCH_SIZE}`
    );
    const deleted = Number(loginResult.rowCount ?? 0);
    loginDeleted += deleted;
    if (deleted < BATCH_SIZE) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  return { auditDeleted, loginDeleted };
}
