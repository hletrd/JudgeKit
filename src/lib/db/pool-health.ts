/**
 * PostgreSQL connection-pool reliability helpers.
 *
 * Two concerns, both reliability-critical:
 *
 * 1. Idle-client error handling. A `pg` Pool keeps live backend connections
 *    open while idle. If the database restarts or a network partition occurs,
 *    every idle client emits an `error` on the pool. node-postgres documents
 *    that if NO listener is attached, Node re-emits it as an uncaught exception
 *    and can crash the process. `attachPoolDiagnostics` always attaches one so
 *    a transient DB blip (including our own deploy `docker compose down` of the
 *    db container) degrades to a logged warning instead of an app crash.
 *
 * 2. Saturation observability. Pool exhaustion (all `max` connections checked
 *    out, requests queuing) is otherwise invisible until requests start timing
 *    out at `connectionTimeoutMillis`. We sample the pool counters and emit a
 *    throttled warning the moment clients begin waiting, turning a silent
 *    latency cliff into an actionable log line.
 *
 * The decision logic is split into pure functions so it is unit-testable
 * without a live pool or real timers.
 */

export interface PoolStats {
  /** Total clients the pool currently owns (idle + in-use). `pool.totalCount`. */
  total: number;
  /** Clients sitting idle, available for immediate checkout. `pool.idleCount`. */
  idle: number;
  /** Requests queued waiting for a free connection. `pool.waitingCount`. */
  waiting: number;
  /** Configured maximum pool size. */
  max: number;
}

/**
 * True when the pool can serve no further request without queuing.
 *
 * A nonzero `waiting` count is the earliest and clearest signal (callers are
 * already blocked). We also treat "every connection checked out and none idle"
 * as saturated, which catches the instant before the first waiter appears.
 */
export function isPoolSaturated(stats: PoolStats): boolean {
  if (stats.waiting > 0) return true;
  return stats.max > 0 && stats.total >= stats.max && stats.idle === 0;
}

/**
 * Whether a saturation warning should be emitted now, given the last time one
 * was emitted. Throttles to at most one log per `throttleMs` so a sustained
 * saturation event does not flood the logs.
 */
export function shouldLogSaturation(
  stats: PoolStats,
  lastLogAtMs: number,
  nowMs: number,
  throttleMs: number
): boolean {
  if (!isPoolSaturated(stats)) return false;
  return nowMs - lastLogAtMs >= throttleMs;
}

/** Minimal structured-logger surface (compatible with the pino logger). */
interface MinimalLogger {
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

/** Subset of `pg.Pool` this module depends on (keeps it test-friendly). */
interface PoolLike {
  on(event: "error", listener: (err: Error) => void): unknown;
  readonly totalCount: number;
  readonly idleCount: number;
  readonly waitingCount: number;
}

export interface PoolDiagnosticsOptions {
  logger: MinimalLogger;
  /** Configured pool max, for the saturation predicate. */
  max: number;
  /** How often to sample pool counters. Default 15s. */
  sampleIntervalMs?: number;
  /** Minimum gap between saturation warnings. Default 60s. */
  throttleMs?: number;
  /** Clock injection for tests. Default `Date.now`. */
  now?: () => number;
}

/**
 * Attach the idle-client error handler and start the (unref'd) saturation
 * sampler. Returns a stop function that clears the sampler — primarily for
 * tests; in production the pool lives for the process lifetime.
 */
export function attachPoolDiagnostics(pool: PoolLike, opts: PoolDiagnosticsOptions): () => void {
  const sampleIntervalMs = opts.sampleIntervalMs ?? 15_000;
  const throttleMs = opts.throttleMs ?? 60_000;
  const now = opts.now ?? (() => Date.now());
  let lastLogAtMs = Number.NEGATIVE_INFINITY;

  // Must exist or an idle backend error becomes an uncaught exception.
  pool.on("error", (err) => {
    opts.logger.error(
      { err },
      "[db-pool] idle client error (connection dropped); pool will reconnect on next checkout"
    );
  });

  const timer = setInterval(() => {
    const stats: PoolStats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
      max: opts.max,
    };
    const tNow = now();
    if (shouldLogSaturation(stats, lastLogAtMs, tNow, throttleMs)) {
      lastLogAtMs = tNow;
      opts.logger.warn(
        { total: stats.total, idle: stats.idle, waiting: stats.waiting, max: stats.max },
        "[db-pool] connection pool saturated — requests are queuing for a DB connection"
      );
    }
  }, sampleIntervalMs);

  // Diagnostics must never keep the event loop (or a test runner) alive.
  if (typeof timer.unref === "function") timer.unref();

  return () => clearInterval(timer);
}
