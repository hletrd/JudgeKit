/**
 * Worker staleness sweep (DB-backed) + its background scheduler.
 *
 * The sweep logic previously lived inline in the judge heartbeat route, which
 * meant it only ran when SOME worker POSTed a heartbeat. In a single-worker
 * deployment (the documented prod topology), if that one worker crashes, no
 * heartbeat ever arrives again, so the dead worker stays `online` forever:
 * admin-health can't detect the dead fleet and active_tasks leaks.
 *
 * This module extracts the sweep so it can run both on every heartbeat AND on a
 * process-level background interval that fires regardless of worker traffic.
 *
 * The pure threshold helpers stay in `worker-staleness.ts` (no DB import) so the
 * unit tests for the predicates remain DB-free.
 */
import { db } from "@/lib/db";
import { judgeWorkers } from "@/lib/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { getDbNowUncached } from "@/lib/db-time";
import { getConfiguredSettings } from "@/lib/system-settings-config";
import { logger } from "@/lib/logger";
import {
  computeStaleStatusCutoff,
  computeActiveTasksResetCutoff,
} from "./worker-staleness";

/**
 * Run the staleness sweep once: flip silent `online` workers to `stale`, then
 * reap workers silent past the stale-claim timeout to the terminal `offline`
 * state (zeroing active_tasks). Idempotent — safe to call from the heartbeat
 * route and from the background interval concurrently. Pass `now` (DB time) when
 * the caller already fetched it to avoid a redundant round-trip.
 */
export type StalenessSweepResult = {
  /** online → stale transitions this sweep (transient; heartbeat may restore). */
  markedStale: number;
  /** stale → offline reaps this sweep (terminal; worker is gone). */
  reapedOffline: number;
};

export async function sweepStaleWorkers(now?: Date): Promise<StalenessSweepResult> {
  const ts = now ?? (await getDbNowUncached());

  // online -> stale (transient: may still be working; next heartbeat restores).
  const markedStale = await db
    .update(judgeWorkers)
    .set({ status: "stale" })
    .where(
      and(
        eq(judgeWorkers.status, "online"),
        lt(judgeWorkers.lastHeartbeatAt, computeStaleStatusCutoff(ts))
      )
    )
    .returning({ id: judgeWorkers.id });

  // stale -> offline (terminal): past the stale-claim timeout the worker holds
  // no reclaimable claim, so reap it and reconcile active_tasks. Only `stale`
  // rows — never a live `online` worker.
  const staleClaimTimeoutMs = getConfiguredSettings().staleClaimTimeoutMs;
  const reapedOffline = await db
    .update(judgeWorkers)
    .set({ status: "offline", deregisteredAt: ts, activeTasks: 0 })
    .where(
      and(
        eq(judgeWorkers.status, "stale"),
        lt(judgeWorkers.lastHeartbeatAt, computeActiveTasksResetCutoff(ts, staleClaimTimeoutMs))
      )
    )
    .returning({ id: judgeWorkers.id });

  // Emit alertable signals on the state transitions. These fire from the app
  // logs the moment a worker is reaped — independent of (and faster than) the
  // next Prometheus scrape of judgekit_judge_workers{status="offline"}. Each
  // transition only matches once (the WHERE filters on the prior status), so a
  // persistently-dead worker is logged exactly once, not every sweep.
  if (reapedOffline.length > 0) {
    logger.warn(
      { reaped: reapedOffline.length, workerIds: reapedOffline.map((w) => w.id) },
      "[judge] staleness sweep reaped unresponsive worker(s) to offline"
    );
  }
  if (markedStale.length > 0) {
    logger.info(
      { markedStale: markedStale.length, workerIds: markedStale.map((w) => w.id) },
      "[judge] staleness sweep marked silent worker(s) stale"
    );
  }

  return { markedStale: markedStale.length, reapedOffline: reapedOffline.length };
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background staleness sweep. Runs once per process (idempotent), on
 * an unref'd interval so it never keeps the process alive. This is what reaps a
 * dead single worker when no other heartbeat would trigger the inline sweep.
 */
export function startWorkerStalenessSweep(intervalMs = 60_000): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    void sweepStaleWorkers().catch((err) => {
      logger.warn({ err }, "[judge] background worker staleness sweep failed");
    });
  }, intervalMs);
  if (typeof sweepTimer.unref === "function") sweepTimer.unref();
}

/**
 * Stop the background staleness sweep. The interval is already unref'd so it
 * never blocks process exit, but an explicit stop is useful for test teardown
 * and hot-reload to avoid leaking timers across runs.
 */
export function stopWorkerStalenessSweep(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
