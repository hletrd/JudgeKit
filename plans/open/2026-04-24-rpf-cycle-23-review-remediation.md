# RPF Cycle 23 Review Remediation Plan

**Date:** 2026-04-24
**Source:** `.context/reviews/_aggregate-cycle-23.md`
**Status:** In Progress

## Scope

This cycle addresses new findings from the cycle-23 multi-perspective review:
- AGG-1: SSE connection leak on unhandled errors
- AGG-2: SSE cleanup timer module-level side effect
- AGG-3: Contest access tokens lack expiry
- AGG-4: importDatabase column-by-position mapping — schema drift risk
- AGG-5: Ranking cache SWR adds SELECT NOW() on every cache check
- AGG-6: ICPC live-rank query missing tie-breakers
- AGG-7: Secret column redaction fragmentation (recurring)
- AGG-8: buildIoiLatePenaltyCaseExpr SQL column parameters not validated

No cycle-23 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix SSE connection leak on unhandled errors (AGG-1)

- **Source:** AGG-1 (CR-1, TR-1, C-1, D-1)
- **Severity / confidence:** MEDIUM / HIGH
- **Cross-agent signal:** 4 of 9 review perspectives
- **Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:467`
- **Problem:** When a connection slot is acquired but a subsequent step throws (e.g., submission query at line 258), the outer catch returns 500 without releasing the slot. This leaks entries in `connectionInfoMap` / `userConnectionCounts` (in-process) or leaves a `rateLimits` row (shared coordination), potentially causing "tooManyConnections" (429) rejections for legitimate subsequent connections.
- **Plan:**
  1. Capture `useSharedCoordination`, `connId`, and `sharedConnectionKey` before the try block so they are accessible in the catch.
  2. Add a cleanup helper that calls `removeConnection(connId)` (in-process) or `releaseSharedSseConnectionSlot(sharedConnectionKey)` (shared) based on the coordination mode.
  3. Call the cleanup helper in the outer catch at line 467.
  4. Add a source-grep test to verify the outer catch includes connection cleanup.
  5. Verify all gates pass.
- **Status:** DONE

### M1: Fix SSE cleanup timer HMR double-registration risk (AGG-2)

- **Source:** AGG-2 (CR-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:101-115`
- **Problem:** The `setInterval` at line 102 runs at module load time. With HMR/turbopack, concurrent module re-evaluation can register two timers. The `clearInterval(globalThis.__sseCleanupTimer)` pattern is not atomic.
- **Plan:**
  1. Wrap the timer setup in an atomic check-and-set using `globalThis.__sseCleanupInitialized` as a guard flag.
  2. Set the flag before `setInterval` and check it before clearing.
  3. Verify all gates pass.
- **Status:** DONE

### M2: Add contest access token deadline check (AGG-3)

- **Source:** AGG-3 (S-1, C-3)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Cross-agent signal:** 2 of 9 review perspectives
- **Citations:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:51-56`, `src/app/api/v1/contests/[assignmentId]/stats/route.ts:69-75`
- **Problem:** Contest access tokens have no expiry. Users can access contest endpoints indefinitely after the contest ends via the token. The access check queries enrollment OR access token but never validates the token against the contest's deadline.
- **Plan:**
  1. In the anti-cheat route access check (line 51-56), add a condition that the assignment's deadline must not have passed (or use the already-fetched `now` and `assignment.deadline` from lines 63-73).
  2. In the stats route access check (line 69-75), add a similar deadline check.
  3. Add source-grep tests verifying the deadline check is present.
  4. Verify all gates pass.
- **Status:** DONE

### L1: Add column-name validation to importDatabase (AGG-4)

- **Source:** AGG-4 (CR-3, T-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Cross-agent signal:** 2 of 9 review perspectives
- **Citations:** `src/lib/db/import.ts:163-168`
- **Problem:** The import function maps columns by position. If the export has different column ordering from the target schema, data is silently written to wrong columns.
- **Plan:**
  1. Before importing, compare exported column names against the target schema's column names (from `getTableColumns`).
  2. If there is a mismatch, log a warning and include it in the import result's error list.
  3. Add a source-grep test for the validation.
  4. Verify all gates pass.
- **Status:** DONE

### L2: Use Date.now() for ranking cache staleness check (AGG-5)

- **Source:** AGG-5 (P-1, C-2)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Cross-agent signal:** 2 of 9 review perspectives
- **Citations:** `src/lib/assignments/contest-scoring.ts:101,114,118,130`
- **Problem:** `computeContestRanking` calls `getDbNowMs()` on every invocation including cache hits, adding a DB round-trip per leaderboard request. The cache's staleness tolerance is 15 seconds, so clock skew of 1-2 seconds from `Date.now()` is acceptable for the staleness check.
- **Plan:**
  1. Replace `getDbNowMs()` calls in the cache-hit path (lines 101-126) with `Date.now()`.
  2. Keep `getDbNowMs()` for cache-write timestamps (lines 114, 130) where authoritative time is needed.
  3. Add a code comment explaining the rationale.
  4. Verify all gates pass.
- **Status:** DONE

### L3: Add tie-breakers to ICPC live-rank query (AGG-6)

- **Source:** AGG-6 (V-1)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/assignments/leaderboard.ts:128-170`
- **Problem:** `computeSingleUserLiveRank` ICPC query does not include the "earlier last AC" and "userId" tie-breakers from the main leaderboard. This can cause the live rank to differ by 1 for tied users.
- **Plan:**
  1. Add `MAX(first_ac_at)` to the `user_totals` CTE.
  2. Add tie-breaker conditions to the WHERE clause matching `contest-scoring.ts:354-361`.
  3. Verify all gates pass.
- **Status:** DONE

---

## Deferred items

### DEFER-1 through DEFER-11: Carried from cycle 22 plan

All prior deferred items (DEFER-1 through DEFER-11 from cycle 22 plan) remain unchanged. See the archived cycle 22 plan for full details.

### DEFER-12: Secret column redaction centralized registry (AGG-7)

- **Source:** AGG-7 (A-2, C-4), carried from prior DEFER-10
- **Severity / confidence:** LOW / HIGH
- **Original severity preserved:** LOW / MEDIUM (upgraded to HIGH confidence from cross-agent signal)
- **Citations:** `src/lib/db/export.ts:245-258`, `src/lib/logger.ts` (REDACT_PATHS), `src/app/api/v1/admin/settings/route.ts:21-25`
- **Reason for deferral:** Refactor-only work that touches multiple files. The current redaction works correctly for all known secret columns. Fixing this requires creating a shared helper and updating multiple callers. Repeatedly identified but consistently deferred as DRY violation without functional impact.
- **Exit criterion:** When a new secret column is added to systemSettings, or when a dedicated security hardening cycle is scheduled.

### DEFER-13: `buildIoiLatePenaltyCaseExpr` SQL column parameter validation (AGG-8)

- **Source:** AGG-8 (V-2)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/lib/assignments/scoring.ts:54-76`
- **Reason for deferral:** All current callers pass hardcoded column references. No user-controlled input reaches this function. Adding validation is defense-in-depth, not a fix for an exploitable bug.
- **Exit criterion:** When a caller is added that constructs column references from user input, or when a dedicated SQL-injection audit is performed.

---

## Progress log

- 2026-04-24: Plan created from cycle-23 aggregate review. 8 findings, 6 fix tasks, 2 deferred.
- 2026-04-24: H1 DONE -- SSE connection slot leak fixed: outer catch now releases slot when acquired.
- 2026-04-24: M1 DONE -- SSE cleanup timer uses atomic __sseCleanupInitialized guard; stale keys collected before deletion.
- 2026-04-24: M2 DONE -- Stats route now enforces deadline for non-instructor access token holders.
- 2026-04-24: L1 DONE -- Import validates column names against schema before inserting; skips mismatched tables.
- 2026-04-24: L2 DONE -- Ranking cache uses Date.now() for staleness checks; getDbNowMs() retained for cache writes.
- 2026-04-24: L3 DONE -- ICPC live-rank query now includes last_ac_at and userId tie-breakers matching main leaderboard.
- 2026-04-24: All gates green (tsc, eslint, vitest, next build). 15 source-grep tests added.
