/**
 * Pure helpers for the judge-worker staleness sweep.
 *
 * Two distinct thresholds govern a worker's degradation:
 *
 *  1. STALE THRESHOLD (`HEARTBEAT_INTERVAL_MS * STALE_MULTIPLIER`, ~90 s):
 *     after this, a worker that has stopped heartbeating is flipped
 *     `online -> stale`. It may still have legitimate in-flight work — a
 *     transient network blip or GC pause — and its NEXT heartbeat flips it back
 *     to `online`, so `active_tasks` MUST NOT be touched at this threshold.
 *
 *  2. STALE-CLAIM TIMEOUT (`getConfiguredSettings().staleClaimTimeoutMs`,
 *     default 300 s, admin-configurable): after this, any submission the worker
 *     had claimed is provably reclaimable by the claim CTE
 *     (`claim/route.ts` stale branch). At this point the worker has been silent
 *     long enough that its `active_tasks` counter cannot reflect real in-flight
 *     work, so it is safe to zero it. This closes the crashed-worker capacity
 *     leak (N1): a SIGKILLed worker that never deregisters would otherwise keep
 *     a phantom `active_tasks` forever.
 *
 * The SAME stale-claim-timeout cutoff also gates the TERMINAL lifecycle
 * transition `stale -> offline` (N6-C6). The worker lifecycle is
 * `online -> stale -> (online | offline)`: a worker silent past the stale-claim
 * timeout can hold no reclaimable claim and has no real in-flight work, so the
 * sweep reaps it to `offline` (mirroring the graceful-deregister terminal
 * state: `status='offline'`, `deregistered_at=now`, `active_tasks=0`). Without
 * this, a crashed worker stays `stale` forever, which pins `admin-health` in
 * `degraded` (it trips on any `stale > 0`) and accumulates dead rows unbounded —
 * the only autonomous lifecycle actor (the heartbeat sweep) previously stopped
 * short of the terminal state. The transition is reversible: a returning
 * worker's next heartbeat sets `status='online'` unconditionally.
 *
 * Both thresholds are computed against DB server time to avoid app/DB clock
 * skew. These helpers return the absolute cutoff `Date`s so the route can build
 * a single deterministic SQL `WHERE` clause.
 */

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const STALE_MULTIPLIER = 3;

/**
 * Cutoff before which a still-`online` worker should be marked `stale`.
 * Workers whose last heartbeat is OLDER than this cutoff are stale.
 */
export function computeStaleStatusCutoff(now: Date): Date {
  return new Date(now.getTime() - HEARTBEAT_INTERVAL_MS * STALE_MULTIPLIER);
}

/**
 * Cutoff before which a silent worker's `active_tasks` is safe to zero.
 * Uses the configured stale-claim timeout (clamped to be at least the stale
 * status threshold, so the active_tasks reset can never fire EARLIER than the
 * status flip even if an operator sets an unusually small timeout). Workers
 * whose last heartbeat is OLDER than this cutoff have had any in-flight claim
 * reclaimed already, so their `active_tasks` no longer reflects real work.
 */
export function computeActiveTasksResetCutoff(now: Date, staleClaimTimeoutMs: number): Date {
  const effectiveMs = Math.max(staleClaimTimeoutMs, HEARTBEAT_INTERVAL_MS * STALE_MULTIPLIER);
  return new Date(now.getTime() - effectiveMs);
}

/**
 * Whether a worker's `active_tasks` should be zeroed by the sweep, given its
 * last heartbeat. A worker only past the stale STATUS threshold (transiently
 * slow but possibly still working) is NOT eligible; only one silent past the
 * stale-claim timeout is.
 */
export function shouldResetActiveTasks(
  lastHeartbeatAt: Date | null,
  now: Date,
  staleClaimTimeoutMs: number,
): boolean {
  if (!lastHeartbeatAt) {
    // No heartbeat ever recorded: treat as eligible only once enough wall time
    // has elapsed that a real worker would have heartbeated. Conservative: use
    // the same reset cutoff relative to `now`. With null we cannot compare, so
    // err on NOT resetting (avoid clobbering a freshly-registered worker that
    // has not had its first heartbeat persisted yet).
    return false;
  }
  return lastHeartbeatAt.getTime() < computeActiveTasksResetCutoff(now, staleClaimTimeoutMs).getTime();
}

/**
 * Whether a `stale` worker should be reaped to the terminal `offline` state by
 * the sweep, given its last heartbeat (N6-C6). The reap cutoff is INTENTIONALLY
 * identical to the `active_tasks`-reset cutoff (`computeActiveTasksResetCutoff`):
 * a worker silent that long can hold no reclaimable claim, so the sweep both
 * zeroes its counter AND transitions it to `offline` in one operation. A worker
 * only past the 90 s stale-status floor (transiently slow, possibly still
 * working and about to heartbeat back to `online`) is NOT reaped. A worker with
 * no recorded heartbeat is NOT reaped (freshly registered, first heartbeat not
 * yet persisted). Keeping this predicate equal to `shouldResetActiveTasks`
 * guarantees the two operations can never drift apart in a future edit.
 */
export function shouldMarkWorkerOffline(
  lastHeartbeatAt: Date | null,
  now: Date,
  staleClaimTimeoutMs: number,
): boolean {
  return shouldResetActiveTasks(lastHeartbeatAt, now, staleClaimTimeoutMs);
}
