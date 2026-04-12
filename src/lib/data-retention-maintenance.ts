import { and, inArray, lt, notInArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { antiCheatEvents, chatMessages, recruitingInvitations, submissions } from "@/lib/db/schema";
import { DATA_RETENTION_DAYS, getRetentionCutoff } from "@/lib/data-retention";

async function pruneChatMessages() {
  const cutoff = getRetentionCutoff(DATA_RETENTION_DAYS.chatMessages);
  await db.delete(chatMessages).where(lt(chatMessages.createdAt, cutoff));
  logger.debug({ cutoff: cutoff.toISOString() }, "Pruned expired chat messages");
}


async function pruneRecruitingInvitations() {
  const cutoff = getRetentionCutoff(DATA_RETENTION_DAYS.recruitingRecords);
  await db.delete(recruitingInvitations).where(
    and(
      lt(recruitingInvitations.updatedAt, cutoff),
      or(
        inArray(recruitingInvitations.status, ["redeemed", "revoked"]),
        and(
          inArray(recruitingInvitations.status, ["pending"]),
          lt(recruitingInvitations.expiresAt, cutoff)
        )
      )
    )
  );
  logger.debug({ cutoff: cutoff.toISOString() }, "Pruned expired recruiting invitations");
}


async function pruneSubmissions() {
  const cutoff = getRetentionCutoff(DATA_RETENTION_DAYS.submissions);
  await db.delete(submissions).where(
    and(
      lt(submissions.submittedAt, cutoff),
      notInArray(submissions.status, ["pending", "queued", "judging"])
    )
  );
  logger.debug({ cutoff: cutoff.toISOString() }, "Pruned expired terminal submissions");
}

async function pruneAntiCheatEvents() {
  const cutoff = getRetentionCutoff(DATA_RETENTION_DAYS.antiCheatEvents);
  await db.delete(antiCheatEvents).where(lt(antiCheatEvents.createdAt, cutoff));
  logger.debug({ cutoff: cutoff.toISOString() }, "Pruned expired anti-cheat events");
}

async function pruneSensitiveOperationalData() {
  try {
    await pruneChatMessages();
    await pruneAntiCheatEvents();
    await pruneRecruitingInvitations();
    await pruneSubmissions();
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
}
