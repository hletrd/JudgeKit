import { and, inArray, lt, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { antiCheatEvents, chatMessages, loginEvents, recruitingInvitations, submissions } from "@/lib/db/schema";
import { DATA_RETENTION_DAYS, DATA_RETENTION_LEGAL_HOLD, getRetentionCutoff } from "@/lib/data-retention";
import { getDbNowMs } from "@/lib/db-time";

const BATCH_SIZE = 5000;
const BATCH_DELAY_MS = 100;

/**
 * Batched DELETE helper. Deletes rows matching the given WHERE clause in
 * batches of BATCH_SIZE to avoid long-running locks and WAL bloat on large
 * tables. Returns the total number of deleted rows.
 */
async function batchedDelete(
  table: typeof antiCheatEvents | typeof chatMessages | typeof loginEvents | typeof recruitingInvitations | typeof submissions,
  whereClause: ReturnType<typeof lt> | ReturnType<typeof and>,
): Promise<number> {
  let totalDeleted = 0;

  while (true) {
    const result = await db.execute(
      sql`DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE ${whereClause} LIMIT ${BATCH_SIZE})`
    );
    const deleted = Number(result.rowCount ?? 0);
    totalDeleted += deleted;
    if (deleted < BATCH_SIZE) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  return totalDeleted;
}

async function pruneChatMessages(nowMs: number) {
  const cutoff = getRetentionCutoff(DATA_RETENTION_DAYS.chatMessages, nowMs);
  const deleted = await batchedDelete(chatMessages, lt(chatMessages.createdAt, cutoff));
  logger.debug({ cutoff: cutoff.toISOString(), deleted }, "Pruned expired chat messages");
}


async function pruneRecruitingInvitations(nowMs: number) {
  const cutoff = getRetentionCutoff(DATA_RETENTION_DAYS.recruitingRecords, nowMs);
  const whereClause = and(
    lt(recruitingInvitations.updatedAt, cutoff),
    or(
      inArray(recruitingInvitations.status, ["redeemed", "revoked"]),
      and(
        inArray(recruitingInvitations.status, ["pending"]),
        lt(recruitingInvitations.expiresAt, cutoff)
      )
    )
  );
  const deleted = await batchedDelete(recruitingInvitations, whereClause);
  logger.debug({ cutoff: cutoff.toISOString(), deleted }, "Pruned expired recruiting invitations");
}


async function pruneSubmissions(nowMs: number) {
  const cutoff = getRetentionCutoff(DATA_RETENTION_DAYS.submissions, nowMs);
  const whereClause = and(
    lt(submissions.submittedAt, cutoff),
    notInArray(submissions.status, ["pending", "queued", "judging"])
  );
  const deleted = await batchedDelete(submissions, whereClause);
  logger.debug({ cutoff: cutoff.toISOString(), deleted }, "Pruned expired terminal submissions");
}

async function pruneAntiCheatEvents(nowMs: number) {
  const cutoff = getRetentionCutoff(DATA_RETENTION_DAYS.antiCheatEvents, nowMs);
  const deleted = await batchedDelete(antiCheatEvents, lt(antiCheatEvents.createdAt, cutoff));
  logger.debug({ cutoff: cutoff.toISOString(), deleted }, "Pruned expired anti-cheat events");
}

async function pruneLoginEvents(nowMs: number) {
  const cutoff = getRetentionCutoff(DATA_RETENTION_DAYS.loginEvents, nowMs);
  const deleted = await batchedDelete(loginEvents, lt(loginEvents.createdAt, cutoff));
  logger.debug({ cutoff: cutoff.toISOString(), deleted }, "Pruned expired login events");
}

async function pruneSensitiveOperationalData() {
  if (DATA_RETENTION_LEGAL_HOLD) {
    logger.info("Data retention legal hold is active — skipping all automatic pruning");
    return;
  }

  try {
    // Use DB server time for retention cutoffs to avoid clock skew between
    // app and DB servers. Data timestamps (submittedAt, createdAt, etc.) are
    // stored using DB server time, so the cutoff must be computed against the
    // same clock to prevent premature deletion or delayed pruning.
    const nowMs = await getDbNowMs();
    await pruneChatMessages(nowMs);
    await pruneAntiCheatEvents(nowMs);
    await pruneRecruitingInvitations(nowMs);
    await pruneSubmissions(nowMs);
    await pruneLoginEvents(nowMs);
  } catch (error) {
    logger.warn({ err: error }, "Failed to prune sensitive operational data");
  }
}

let pruneTimer: ReturnType<typeof setInterval> | null = null;
declare global {
  var __sensitiveDataPruneTimer: ReturnType<typeof setInterval> | undefined;
}

export function startSensitiveDataPruning() {
  if (globalThis.__sensitiveDataPruneTimer) clearInterval(globalThis.__sensitiveDataPruneTimer);
  globalThis.__sensitiveDataPruneTimer = setInterval(pruneSensitiveOperationalData, 24 * 60 * 60 * 1000);
  // Allow the process to exit even if the timer is still active
  if (globalThis.__sensitiveDataPruneTimer && typeof globalThis.__sensitiveDataPruneTimer === "object" && "unref" in globalThis.__sensitiveDataPruneTimer) {
    globalThis.__sensitiveDataPruneTimer.unref();
  }
  pruneTimer = globalThis.__sensitiveDataPruneTimer;

  pruneSensitiveOperationalData().catch(() => {
    // Errors already logged inside pruneSensitiveOperationalData
  });
}

export function stopSensitiveDataPruning() {
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
  // Also clear the global reference so external callers (e.g., monitoring
  // endpoints) can tell that pruning is stopped. Without this, the global
  // would retain a stale timer ID after clearInterval, producing a false
  // "active" signal.
  globalThis.__sensitiveDataPruneTimer = undefined;
}
