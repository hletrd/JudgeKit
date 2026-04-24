# RPF Cycle 5 (Loop Cycle 5/100) — Aggregate Review

**Date:** 2026-04-24
**Base commit:** b7a39a76 (cycle 4 multi-agent review + remediation)
**HEAD commit:** b7a39a76
**Review artifacts:** code-reviewer, security-reviewer, architect, test-engineer — 4 lanes.

## Deduped Findings (sorted by severity then signal)

**No new production-code findings this cycle.** All 4 review perspectives confirm: no source code has changed since cycle 4, and the codebase remains in a stable, mature state.

### New Observations (Non-Code, Marginal Improvement)

**AUTH-1 (code-reviewer, security-reviewer, architect lanes): JWT `authenticatedAt` uses `Date.now()` instead of DB time** [LOW/MEDIUM]
- `src/lib/auth/config.ts:352` uses `Math.trunc(Date.now() / 1000)` to set the `authenticatedAt` timestamp on the JWT at sign-in. This timestamp is later compared against `tokenInvalidatedAt` from the DB in `isTokenInvalidated()`. Clock skew between app and DB could cause a token to be considered valid for a few seconds after password change/forced logout.
- **Impact:** At most a few seconds of window on token revocation. The JWT callback fires once at sign-in; the refresh path (line 390) preserves the original sign-in time.
- **Mitigation cost:** Would require an async DB query in the JWT callback (performance concern for sign-in latency) for marginal benefit.
- This is the same systemic risk class as deferred ARCH-4 (no lint guard against `Date.now()` in DB transactions).
- Confidence: MEDIUM

**TE-3 (test-engineer lane): No unit test for `authenticatedAt` clock-skew path** [LOW/LOW]
- The JWT callback's `Date.now()` usage for `authenticatedAt` lacks a targeted regression test. However, this is a sign-in path (fires once), not a transaction comparison path, and the test value is marginal.
- Confidence: LOW

## Cross-Agent Agreement

All 4 reviewers confirm:
1. No new production-code findings this cycle.
2. No source code has changed since cycle 4.
3. All prior fixes from cycles 1-4 and cycles 37-55 remain intact.
4. The codebase is in a stable, mature state.
5. AUTH-1 is the same systemic risk class as deferred ARCH-4 — both relate to `Date.now()` usage where DB time would be more correct.

## Carry-Over Deferred Items (unchanged from cycle 4 aggregate)

Total: **23 deferred items** — all carried forward. Unchanged list:

- **AGG-2 (cycle 45):** `atomicConsumeRateLimit` uses `Date.now()` in hot path — MEDIUM/MEDIUM, deferred.
- **AGG-2:** Leaderboard freeze uses `Date.now()` — LOW/LOW, deferred.
- **AGG-5:** `console.error` in client components — LOW/MEDIUM, deferred.
- **AGG-6:** SSE O(n) eviction scan — LOW/LOW, deferred.
- **AGG-7 / ARCH-2:** Manual routes duplicate `createApiHandler` boilerplate — MEDIUM/MEDIUM, deferred.
- **AGG-8:** Global timer HMR pattern duplication — LOW/MEDIUM, deferred.
- **AGG-3 (cycle 48):** Practice page unsafe type assertion — LOW/LOW, deferred.
- **SEC-2 (cycle 43):** Anti-cheat heartbeat dedup uses `Date.now()` for LRU cache — LOW/LOW, deferred.
- **SEC-3:** Anti-cheat copies user text content — LOW/LOW, deferred.
- **SEC-4:** Docker build error leaks paths — LOW/LOW, deferred.
- **PERF-3:** Anti-cheat heartbeat gap query transfers up to 5000 rows — MEDIUM/MEDIUM, deferred.
- **DES-1:** Chat widget button badge lacks ARIA announcement — LOW/LOW, deferred.
- **DES-1 (cycle 46):** Contests page badge hardcoded colors — LOW/LOW, deferred.
- **DES-1 (cycle 48):** Anti-cheat privacy notice accessibility — LOW/LOW, deferred.
- **DOC-1:** SSE route ADR — LOW/LOW, deferred.
- **DOC-2:** Docker client dual-path docs — LOW/LOW, deferred.
- **ARCH-3:** Stale-while-revalidate cache pattern duplication — LOW/LOW, deferred.
- **TE-1 (cycle 51):** Missing integration test for concurrent recruiting token redemption — LOW/MEDIUM, deferred.
- **I18N-JA-ASPIRATIONAL (cycle 55):** `messages/ja.json` absent — LOW/LOW, deferred.
- **DES-RUNTIME-{1..5} (cycle 55):** blocked-by-sandbox runtime findings — LOW..HIGH-if-violated, deferred.
- **#21:** vitest unit parallel-contention flakes — LOW/MEDIUM, deferred.
- **ARCH-4 (cycle 4):** No lint guard against `Date.now()` in DB transactions — LOW/MEDIUM, deferred.
- **TE-2 (cycle 4):** Missing unit test for judge claim route `getDbNowUncached()` usage — LOW/MEDIUM, deferred (test was created in cycle 4, this item should be marked as addressed — see note below).

## New Items Added This Cycle

- **AUTH-1:** JWT `authenticatedAt` uses `Date.now()` instead of DB time — LOW/MEDIUM. Same systemic class as ARCH-4. Marginal improvement; adding a DB query to the sign-in path has performance tradeoff.
- **TE-3:** No unit test for `authenticatedAt` clock-skew path — LOW/LOW. Marginal test value for sign-in path.

**Total deferred items: 23 + 2 new = 25 entries.**

**Note on TE-2:** The test for judge claim route `getDbNowUncached()` usage was implemented in cycle 4 (commit `10562fe3`). This deferred item should be considered resolved but remains in the carry-over list pending explicit archival in the next plan update.

## AGENT FAILURES

None. All 4 reviewer lanes completed and wrote artifacts.

## Verified Fixes From Prior Cycles (All Still Intact)

All fixes from cycles 1-4 and cycles 37-55 remain intact. Spot-verified across multiple angles (code-quality, security, architecture, test-engineer).
