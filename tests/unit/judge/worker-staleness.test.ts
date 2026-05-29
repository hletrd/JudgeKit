import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_INTERVAL_MS,
  STALE_MULTIPLIER,
  computeStaleStatusCutoff,
  computeActiveTasksResetCutoff,
  shouldResetActiveTasks,
  shouldMarkWorkerOffline,
} from "@/lib/judge/worker-staleness";

const STALE_STATUS_MS = HEARTBEAT_INTERVAL_MS * STALE_MULTIPLIER; // 90_000
const DEFAULT_STALE_CLAIM_MS = 300_000;
const NOW = new Date("2026-05-29T12:00:00.000Z");

describe("computeStaleStatusCutoff", () => {
  it("returns now minus the 90s stale-status window", () => {
    const cutoff = computeStaleStatusCutoff(NOW);
    expect(NOW.getTime() - cutoff.getTime()).toBe(STALE_STATUS_MS);
  });
});

describe("computeActiveTasksResetCutoff", () => {
  it("uses the configured stale-claim timeout when it exceeds the stale-status window", () => {
    const cutoff = computeActiveTasksResetCutoff(NOW, DEFAULT_STALE_CLAIM_MS);
    expect(NOW.getTime() - cutoff.getTime()).toBe(DEFAULT_STALE_CLAIM_MS);
  });

  it("never resets earlier than the stale-status window even with a tiny configured timeout", () => {
    // An operator could set staleClaimTimeoutMs as low as 10_000; the reset must
    // still not fire before the status flip (90s), otherwise a transiently-slow
    // live worker could have its active_tasks clobbered.
    const cutoff = computeActiveTasksResetCutoff(NOW, 10_000);
    expect(NOW.getTime() - cutoff.getTime()).toBe(STALE_STATUS_MS);
  });
});

describe("shouldResetActiveTasks", () => {
  it("resets a worker silent past the stale-claim timeout", () => {
    const lastHeartbeat = new Date(NOW.getTime() - (DEFAULT_STALE_CLAIM_MS + 1_000));
    expect(shouldResetActiveTasks(lastHeartbeat, NOW, DEFAULT_STALE_CLAIM_MS)).toBe(true);
  });

  it("does NOT reset a worker only recently stale (past 90s but within the stale-claim timeout)", () => {
    // Past the 90s status threshold but well within the 300s reset threshold:
    // this worker may still be doing real in-flight work and is about to
    // heartbeat back to online — its active_tasks must be left intact.
    const lastHeartbeat = new Date(NOW.getTime() - (STALE_STATUS_MS + 5_000));
    expect(shouldResetActiveTasks(lastHeartbeat, NOW, DEFAULT_STALE_CLAIM_MS)).toBe(false);
  });

  it("does NOT reset a worker exactly at the stale-claim timeout boundary", () => {
    const lastHeartbeat = new Date(NOW.getTime() - DEFAULT_STALE_CLAIM_MS);
    // Strict less-than: a worker exactly at the cutoff is not yet eligible.
    expect(shouldResetActiveTasks(lastHeartbeat, NOW, DEFAULT_STALE_CLAIM_MS)).toBe(false);
  });

  it("does NOT reset a freshly-heartbeated worker", () => {
    const lastHeartbeat = new Date(NOW.getTime() - 1_000);
    expect(shouldResetActiveTasks(lastHeartbeat, NOW, DEFAULT_STALE_CLAIM_MS)).toBe(false);
  });

  it("does NOT reset when lastHeartbeatAt is null (never heartbeated)", () => {
    // Avoid clobbering a freshly-registered worker whose first heartbeat has not
    // been persisted yet.
    expect(shouldResetActiveTasks(null, NOW, DEFAULT_STALE_CLAIM_MS)).toBe(false);
  });

  it("respects a tiny configured timeout by deferring to the 90s floor", () => {
    // With a 10s configured timeout, a worker stale for 2 minutes is past the
    // 90s floor and therefore eligible.
    const lastHeartbeat = new Date(NOW.getTime() - 120_000);
    expect(shouldResetActiveTasks(lastHeartbeat, NOW, 10_000)).toBe(true);
    // But one only 60s stale is still within the 90s floor -> not eligible.
    const recent = new Date(NOW.getTime() - 60_000);
    expect(shouldResetActiveTasks(recent, NOW, 10_000)).toBe(false);
  });
});

describe("shouldMarkWorkerOffline (N6-C6 stale -> offline reaper)", () => {
  it("reaps a worker silent past the stale-claim timeout to offline", () => {
    const lastHeartbeat = new Date(NOW.getTime() - (DEFAULT_STALE_CLAIM_MS + 1_000));
    expect(shouldMarkWorkerOffline(lastHeartbeat, NOW, DEFAULT_STALE_CLAIM_MS)).toBe(true);
  });

  it("does NOT reap a worker only recently stale (past 90s but within the stale-claim timeout)", () => {
    // Past the 90s status threshold but well within the 300s reap threshold:
    // this worker may still be doing real in-flight work and is about to
    // heartbeat back to online — it must stay `stale` and keep active_tasks.
    const lastHeartbeat = new Date(NOW.getTime() - (STALE_STATUS_MS + 5_000));
    expect(shouldMarkWorkerOffline(lastHeartbeat, NOW, DEFAULT_STALE_CLAIM_MS)).toBe(false);
  });

  it("does NOT reap a worker exactly at the stale-claim timeout boundary (strict <)", () => {
    const lastHeartbeat = new Date(NOW.getTime() - DEFAULT_STALE_CLAIM_MS);
    expect(shouldMarkWorkerOffline(lastHeartbeat, NOW, DEFAULT_STALE_CLAIM_MS)).toBe(false);
  });

  it("does NOT reap a freshly-heartbeated worker", () => {
    const lastHeartbeat = new Date(NOW.getTime() - 1_000);
    expect(shouldMarkWorkerOffline(lastHeartbeat, NOW, DEFAULT_STALE_CLAIM_MS)).toBe(false);
  });

  it("does NOT reap when lastHeartbeatAt is null (never heartbeated)", () => {
    // Avoid clobbering a freshly-registered worker whose first heartbeat has not
    // been persisted yet.
    expect(shouldMarkWorkerOffline(null, NOW, DEFAULT_STALE_CLAIM_MS)).toBe(false);
  });

  it("uses the SAME cutoff as the active_tasks reset (invariant must not drift)", () => {
    // The reap and the active_tasks-reset MUST share one cutoff so the combined
    // single-UPDATE in heartbeat/route.ts can never split the two thresholds.
    // Probe a dense band of lastHeartbeat ages across multiple configured
    // timeouts; the two predicates must agree on every sample.
    for (const timeout of [10_000, DEFAULT_STALE_CLAIM_MS, 600_000]) {
      for (let ageMs = 0; ageMs <= 700_000; ageMs += 5_000) {
        const lastHeartbeat = new Date(NOW.getTime() - ageMs);
        expect(shouldMarkWorkerOffline(lastHeartbeat, NOW, timeout)).toBe(
          shouldResetActiveTasks(lastHeartbeat, NOW, timeout),
        );
      }
    }
  });
});
