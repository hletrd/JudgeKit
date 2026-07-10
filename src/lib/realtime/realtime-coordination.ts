import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { realtimeCoordination } from "@/lib/db/schema";
import { getDbNowUncached } from "@/lib/db-time";
import { logger } from "@/lib/logger";
import { escapeLikePattern } from "@/lib/db/like";

let hasWarnedSingleInstanceOnly = false;
const TRUE_VALUES = /^(1|true|yes|on)$/i;
const POSTGRES_BACKEND = "postgresql";
const UNSUPPORTED_BACKENDS = new Set(["redis"]);
const SSE_KEY_PREFIX = "realtime:sse:user:";
const HEARTBEAT_KEY_PREFIX = "realtime:heartbeat:";

function parseReplicaCount(value: string | undefined) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getRealtimeCoordinationStatus() {
  const backend = (process.env.REALTIME_COORDINATION_BACKEND || "none").trim().toLowerCase();
  const replicaCount = parseReplicaCount(
    process.env.APP_INSTANCE_COUNT || process.env.WEB_CONCURRENCY,
  );
  const hasSharedCoordination = backend === POSTGRES_BACKEND;
  const isProductionLike = process.env.NODE_ENV === "production";
  const explicitSingleInstanceAck = TRUE_VALUES.test(
    process.env.REALTIME_SINGLE_INSTANCE_ACK || "",
  );
  const declaredSingleInstance = replicaCount === 1 || explicitSingleInstanceAck;
  const backendConfigUnsupported = UNSUPPORTED_BACKENDS.has(backend);
  const deploymentDeclarationMissing =
    isProductionLike && !declaredSingleInstance && replicaCount === null && !backendConfigUnsupported && !hasSharedCoordination;
  const multiInstanceRequested = replicaCount !== null && replicaCount > 1;

  return {
    backend,
    replicaCount,
    hasSharedCoordination,
    explicitSingleInstanceAck,
    backendConfigUnsupported,
    deploymentDeclarationMissing,
    requiresSingleInstanceGuard:
      !hasSharedCoordination && (backendConfigUnsupported || deploymentDeclarationMissing || multiInstanceRequested),
  };
}

export function usesSharedRealtimeCoordination() {
  return getRealtimeCoordinationStatus().hasSharedCoordination;
}

export function getRealtimeConnectionKey(userId: string, connectionId: string) {
  return `${SSE_KEY_PREFIX}${userId}:${connectionId}`;
}

function getSsePrefixPattern() {
  return `${SSE_KEY_PREFIX}%`;
}

export function getSseUserPattern(userId: string) {
  return `${SSE_KEY_PREFIX}${escapeLikePattern(userId)}:%`;
}

function getHeartbeatPrefixPattern() {
  return `${HEARTBEAT_KEY_PREFIX}%`;
}

function getHeartbeatKey(assignmentId: string, userId: string) {
  return `${HEARTBEAT_KEY_PREFIX}${assignmentId}:${userId}`;
}

async function withPgAdvisoryLock<T>(lockKey: string, fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(('x' || md5(${lockKey}))::bit(64)::bigint)`);
    return fn(tx);
  });
}

export async function acquireSharedSseConnectionSlot({
  userId,
  connectionId,
  maxGlobalConnections,
  maxUserConnections,
  timeoutMs,
}: {
  userId: string;
  connectionId: string;
  maxGlobalConnections: number;
  maxUserConnections: number;
  timeoutMs: number;
}) {
  const key = getRealtimeConnectionKey(userId, connectionId);

  // Use DB server time for all comparisons against DB-stored timestamps
  // to avoid clock skew between app and DB servers. Fetch the timestamp
  // BEFORE acquiring the advisory lock to minimize lock hold duration.
  const dbNow = await getDbNowUncached();
  const nowMs = dbNow.getTime();

  return withPgAdvisoryLock("realtime:sse:acquire", async (tx) => {
    const expiresAt = nowMs + timeoutMs + 30_000;

    await tx.delete(realtimeCoordination).where(
      and(
        sql`${realtimeCoordination.key} LIKE ${getSsePrefixPattern()} ESCAPE '\\'`,
        lt(realtimeCoordination.expiresAt, nowMs),
      )
    );

    const [counts] = await tx
      .select({
        total: sql<number>`count(*)`,
        userTotal: sql<number>`count(*) filter (where ${realtimeCoordination.key} like ${getSseUserPattern(userId)} escape '\\')`,
      })
      .from(realtimeCoordination)
      .where(
        and(
          sql`${realtimeCoordination.key} LIKE ${getSsePrefixPattern()} ESCAPE '\\'`,
          gte(realtimeCoordination.expiresAt, nowMs),
        )
      );

    if (Number(counts?.total ?? 0) >= maxGlobalConnections) {
      return { ok: false as const, reason: "serverBusy" as const };
    }

    if (Number(counts?.userTotal ?? 0) >= maxUserConnections) {
      return { ok: false as const, reason: "tooManyConnections" as const };
    }

    await tx.insert(realtimeCoordination).values({
      key,
      expiresAt,
      lastSeenAt: nowMs,
    });

    return { ok: true as const, key };
  });
}

export async function releaseSharedSseConnectionSlot(connectionKey: string) {
  await db.delete(realtimeCoordination).where(eq(realtimeCoordination.key, connectionKey));
}

export async function shouldRecordSharedHeartbeat({
  assignmentId,
  userId,
  minIntervalMs = 60_000,
}: {
  assignmentId: string;
  userId: string;
  minIntervalMs?: number;
}) {
  const key = getHeartbeatKey(assignmentId, userId);

  // Use DB server time for heartbeat dedup to avoid clock skew
  // between app and DB servers. Fetch the timestamp BEFORE acquiring
  // the advisory lock to minimize lock hold duration.
  const dbNow = await getDbNowUncached();
  const nowMs = dbNow.getTime();

  return withPgAdvisoryLock(key, async (tx) => {
    const [existing] = await tx
      .select({ lastSeenAt: realtimeCoordination.lastSeenAt })
      .from(realtimeCoordination)
      .where(eq(realtimeCoordination.key, key))
      .limit(1);

    if (existing && nowMs - existing.lastSeenAt < minIntervalMs) {
      return false;
    }

    if (existing) {
      await tx
        .update(realtimeCoordination)
        .set({
          lastSeenAt: nowMs,
          expiresAt: nowMs + minIntervalMs,
        })
        .where(eq(realtimeCoordination.key, key));
    } else {
      await tx.insert(realtimeCoordination).values({
        key,
        expiresAt: nowMs + minIntervalMs,
        lastSeenAt: nowMs,
      });
    }

    // Cleanup stale heartbeat entries for this assignment to prevent
    // unbounded table growth. Entries older than one interval past their
    // expiration are safe to delete (the just-updated entry has
    // expiresAt = nowMs + minIntervalMs, so it is retained).
    await tx.delete(realtimeCoordination).where(
      and(
        sql`${realtimeCoordination.key} LIKE ${getHeartbeatPrefixPattern()} ESCAPE '\\'`,
        lt(realtimeCoordination.expiresAt, nowMs - minIntervalMs),
      )
    );

    return true;
  });
}

/**
 * Undo a heartbeat dedup advancement after the corresponding antiCheatEvents
 * insert failed. `shouldRecordSharedHeartbeat` durably commits the dedup row
 * BEFORE the caller inserts the event; if that insert throws, leaving the row
 * advanced suppresses heartbeats for the rest of the window — the client's
 * retry gets `shouldRecord=false` and an honest candidate accrues a
 * `submission_stale_heartbeat` flag. Deleting the row re-opens the window so
 * the retry re-records. (Worst case a concurrent instance also records one
 * extra heartbeat row — dedup is churn reduction, not correctness.)
 */
export async function rollbackSharedHeartbeat({
  assignmentId,
  userId,
}: {
  assignmentId: string;
  userId: string;
}) {
  const key = getHeartbeatKey(assignmentId, userId);
  await db.delete(realtimeCoordination).where(eq(realtimeCoordination.key, key));
}

export function warnIfSingleInstanceRealtimeOnly(routeName: string) {
  const status = getRealtimeCoordinationStatus();
  if (
    status.hasSharedCoordination
    || status.requiresSingleInstanceGuard
    || hasWarnedSingleInstanceOnly
  ) {
    return;
  }

  hasWarnedSingleInstanceOnly = true;
  logger.warn(
    {
      routeName,
      backend: status.backend,
      replicaCount: status.replicaCount,
      explicitSingleInstanceAck: status.explicitSingleInstanceAck,
    },
    "[realtime] Running with process-local coordination; keep the web app single-instance and declare APP_INSTANCE_COUNT=1 (or REALTIME_SINGLE_INSTANCE_ACK=1) unless shared realtime coordination is implemented",
  );
}

export function getUnsupportedRealtimeGuard(routeName: string) {
  const status = getRealtimeCoordinationStatus();
  if (!status.requiresSingleInstanceGuard) {
    warnIfSingleInstanceRealtimeOnly(routeName);
    return null;
  }

  if (status.backendConfigUnsupported) {
    logger.error(
      { routeName, backend: status.backend, replicaCount: status.replicaCount },
      "[realtime] Shared realtime backend configuration is declared but not implemented",
    );
    return {
      error: "unsupportedRealtimeBackendConfig",
      message:
        "REALTIME_COORDINATION_BACKEND currently supports only postgresql shared coordination. Unset it or set it to postgresql and keep the database reachable.",
    };
  }

  if (status.deploymentDeclarationMissing) {
    logger.error(
      { routeName, backend: status.backend, replicaCount: status.replicaCount },
      "[realtime] Production deployment missing explicit single-instance declaration for process-local realtime coordination",
    );
    return {
      error: "realtimeDeploymentDeclarationRequired",
      message:
        "Declare APP_INSTANCE_COUNT=1 (or REALTIME_SINGLE_INSTANCE_ACK=1) before using process-local realtime routes in production.",
    };
  }

  logger.error(
    { routeName, backend: status.backend, replicaCount: status.replicaCount },
    "[realtime] Multi-instance deployment configured without shared realtime coordination",
  );
  return {
    error: "unsupportedMultiInstanceRealtime",
    message: "Configure shared realtime coordination or keep the web app to a single instance for this route.",
  };
}
