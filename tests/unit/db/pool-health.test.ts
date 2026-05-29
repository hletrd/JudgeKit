import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isPoolSaturated,
  shouldLogSaturation,
  attachPoolDiagnostics,
  type PoolStats,
} from "@/lib/db/pool-health";

const base: PoolStats = { total: 0, idle: 0, waiting: 0, max: 20 };

describe("isPoolSaturated", () => {
  it("is true when any request is waiting for a connection", () => {
    expect(isPoolSaturated({ ...base, total: 5, idle: 3, waiting: 1 })).toBe(true);
  });

  it("is true when every connection is checked out and none idle", () => {
    expect(isPoolSaturated({ ...base, total: 20, idle: 0, waiting: 0, max: 20 })).toBe(true);
  });

  it("is false when idle connections remain", () => {
    expect(isPoolSaturated({ ...base, total: 20, idle: 4, waiting: 0, max: 20 })).toBe(false);
  });

  it("is false when below max with no waiters", () => {
    expect(isPoolSaturated({ ...base, total: 10, idle: 0, waiting: 0, max: 20 })).toBe(false);
  });

  it("does not flag saturation purely from max=0 (treats only waiters as saturated)", () => {
    expect(isPoolSaturated({ total: 0, idle: 0, waiting: 0, max: 0 })).toBe(false);
    expect(isPoolSaturated({ total: 0, idle: 0, waiting: 2, max: 0 })).toBe(true);
  });
});

describe("shouldLogSaturation", () => {
  const saturated: PoolStats = { total: 20, idle: 0, waiting: 3, max: 20 };

  it("returns false when not saturated regardless of elapsed time", () => {
    expect(shouldLogSaturation({ ...base, total: 1, idle: 1 }, 0, 10_000_000, 60_000)).toBe(false);
  });

  it("logs on the first occurrence (lastLogAt = -Infinity)", () => {
    expect(shouldLogSaturation(saturated, Number.NEGATIVE_INFINITY, 1_000, 60_000)).toBe(true);
  });

  it("suppresses a repeat within the throttle window", () => {
    expect(shouldLogSaturation(saturated, 1_000, 1_000 + 59_999, 60_000)).toBe(false);
  });

  it("logs again once the throttle window has elapsed", () => {
    expect(shouldLogSaturation(saturated, 1_000, 1_000 + 60_000, 60_000)).toBe(true);
  });
});

describe("attachPoolDiagnostics", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function makeFakePool(stats: { total: number; idle: number; waiting: number }) {
    let errorHandler: ((err: Error) => void) | undefined;
    return {
      on(_event: "error", listener: (err: Error) => void) {
        errorHandler = listener;
        return this;
      },
      emitError(err: Error) {
        errorHandler?.(err);
      },
      hasErrorHandler: () => errorHandler !== undefined,
      get totalCount() {
        return stats.total;
      },
      get idleCount() {
        return stats.idle;
      },
      get waitingCount() {
        return stats.waiting;
      },
    };
  }

  it("registers an idle-client error handler that logs instead of throwing", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const pool = makeFakePool({ total: 1, idle: 1, waiting: 0 });
    const stop = attachPoolDiagnostics(pool, { logger, max: 20 });

    expect(pool.hasErrorHandler()).toBe(true);
    expect(() => pool.emitError(new Error("idle backend reset"))).not.toThrow();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0]).toMatchObject({ err: expect.any(Error) });
    stop();
  });

  it("emits a throttled saturation warning while the pool is saturated", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const pool = makeFakePool({ total: 20, idle: 0, waiting: 5 });
    let clock = 1_000_000;
    const stop = attachPoolDiagnostics(pool, {
      logger,
      max: 20,
      sampleIntervalMs: 1_000,
      throttleMs: 60_000,
      now: () => clock,
    });

    // First sample: saturated → one warning.
    vi.advanceTimersByTime(1_000);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toMatchObject({ waiting: 5, max: 20 });

    // Next sample within the throttle window → suppressed.
    clock += 1_000;
    vi.advanceTimersByTime(1_000);
    expect(logger.warn).toHaveBeenCalledTimes(1);

    // Past the throttle window → logs again.
    clock += 60_000;
    vi.advanceTimersByTime(1_000);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    stop();
  });

  it("does not warn when the pool is healthy", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const pool = makeFakePool({ total: 5, idle: 3, waiting: 0 });
    const stop = attachPoolDiagnostics(pool, { logger, max: 20, sampleIntervalMs: 1_000 });
    vi.advanceTimersByTime(5_000);
    expect(logger.warn).not.toHaveBeenCalled();
    stop();
  });

  it("stop() clears the sampler so no further warnings fire", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const pool = makeFakePool({ total: 20, idle: 0, waiting: 5 });
    const stop = attachPoolDiagnostics(pool, { logger, max: 20, sampleIntervalMs: 1_000 });
    stop();
    vi.advanceTimersByTime(10_000);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
