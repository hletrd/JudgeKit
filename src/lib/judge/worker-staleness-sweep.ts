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
export async function sweepStaleWorkers(now?: Date): Promise<void> {
  const ts = now ?? (await getDbNowUncached());

  // online -> stale (transient: may still be working; next heartbeat restores).
  await db
    .update(judgeWorkers)
    .set({ status: "stale" })
    .where(
      and(
        eq(judgeWorkers.status, "online"),
        lt(judgeWorkers.lastHeartbeatAt, computeStaleStatusCutoff(ts))
      )
    );

  // stale -> offline (terminal): past the stale-claim timeout the worker holds
  // no reclaimable claim, so reap it and reconcile active_tasks. Only `stale`
  // rows — never a live `online` worker.
  const staleClaimTimeoutMs = getConfiguredSettings().staleClaimTimeoutMs;
  await db
    .update(judgeWorkers)
    .set({ status: "offline", deregisteredAt: ts, activeTasks: 0 })
    .where(
      and(
        eq(judgeWorkers.status, "stale"),
        lt(judgeWorkers.lastHeartbeatAt, computeActiveTasksResetCutoff(ts, staleClaimTimeoutMs))
      )
    );
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
