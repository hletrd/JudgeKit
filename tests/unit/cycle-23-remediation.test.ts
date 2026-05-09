/**
 * Source-grep tests for cycle-23 fixes:
 * - H1: SSE connection leak cleanup on unhandled errors
 * - M1: SSE cleanup timer HMR guard
 * - M2: Contest access token deadline check
 * - L1: Import column-name validation
 * - L2: Ranking cache uses Date.now() for staleness
 * - L3: ICPC live-rank tie-breakers
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../..");

function src(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf-8");
}

describe("Cycle 23: SSE connection leak fix (H1)", () => {
  const eventsRoute = src("src/app/api/v1/submissions/[id]/events/route.ts");

  it("declares slotAcquired flag before the try block", () => {
    expect(eventsRoute).toContain("let slotAcquired = false");
  });

  it("sets slotAcquired to true after connection acquisition", () => {
    expect(eventsRoute).toContain("slotAcquired = true");
  });

  it("releases the connection slot in the outer catch when slotAcquired is true", () => {
    expect(eventsRoute).toContain("if (slotAcquired)");
    expect(eventsRoute).toContain("releaseSharedSseConnectionSlot(sharedConnectionKey)");
    expect(eventsRoute).toContain("removeConnection(connId)");
  });
});

describe("Cycle 23: SSE cleanup timer HMR guard (M1)", () => {
  const eventsRoute = src("src/app/api/v1/submissions/[id]/events/route.ts");

  it("uses an atomic guard flag to prevent double-registration", () => {
    expect(eventsRoute).toContain("__sseCleanupInitialized");
  });

  it("collects stale keys before deletion to avoid Map mutation during iteration", () => {
    expect(eventsRoute).toContain("const staleKeys: string[] = []");
    expect(eventsRoute).toContain("staleKeys.push(connId)");
  });
});

describe("Cycle 23: Contest access token deadline check (M2)", () => {
  const statsRoute = src("src/app/api/v1/contests/[assignmentId]/stats/route.ts");

  it("checks the assignment deadline for non-instructor users with access tokens", () => {
    expect(statsRoute).toContain("contestEnded");
    expect(statsRoute).toContain("assignment.deadline");
  });

  it("uses DB server time for the deadline comparison", () => {
    expect(statsRoute).toContain("SELECT NOW()");
  });
});

describe("Cycle 23: Import column-name validation (L1)", () => {
  const importModule = src("src/lib/db/import.ts");

  it("validates exported column names against target schema", () => {
    expect(importModule).toContain("schemaColumns");
    expect(importModule).toContain("unknownColumns");
    expect(importModule).toContain("missingColumns");
  });

  it("logs a warning on schema drift", () => {
    expect(importModule).toContain("schema drift detected");
  });

  it("skips tables with column mismatches instead of corrupting data", () => {
    expect(importModule).toContain("column mismatch");
  });
});

describe("Cycle 23: Ranking cache uses Date.now() for staleness (L2)", () => {
  const contestScoring = src("src/lib/assignments/contest-scoring.ts");

  it("uses Date.now() for the cache staleness check instead of getDbNowMs()", () => {
    // The staleness check should use Date.now(), not getDbNowMs()
    const lines = contestScoring.split("\n");
    const stalenessLine = lines.find((l) => l.includes("const nowMs = Date.now()"));
    expect(stalenessLine).toBeDefined();
  });

  it("retains getDbNowMs() for cache-write timestamps", () => {
    // Cache writes should still use getDbNowMs()
    const dbNowUsages = contestScoring.match(/getDbNowMs\(\)/g);
    expect(dbNowUsages?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Cycle 23: ICPC live-rank tie-breakers (L3)", () => {
  const leaderboard = src("src/lib/assignments/leaderboard.ts");

  it("includes last_ac_at in the user_totals CTE", () => {
    expect(leaderboard).toContain("MAX(CASE WHEN us.has_ac = 1 THEN us.first_ac_at ELSE NULL END) AS last_ac_at");
  });

  it("includes earlier last AC tie-breaker in the WHERE clause", () => {
    // Earlier last AC (smaller timestamp) ranks better
    expect(leaderboard).toContain("ut.last_ac_at < t.last_ac_at");
  });

  it("includes userId lexicographic tie-breaker in the WHERE clause", () => {
    expect(leaderboard).toContain("ut.user_id < t.user_id");
  });
});
