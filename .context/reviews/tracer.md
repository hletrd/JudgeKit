# Tracer Pass — RPF Cycle 2/100

**Date:** 2026-04-26
**Lane:** tracer
**Scope:** Causal flow tracing, hypothesis competition

## Hypothesis Tournament

### H1: "Cycle-1 commits are inconsistent at HEAD because cycle 1 forgot to git-add source changes"
**Evidence for:**
- `git diff` shows 3 modified files in working tree.
- `git show c915da0b` modifies only test file, not src/proxy.ts.
- `git show 5cde234e` modifies only anti-cheat monitor, not env.ts.
- `git show 000bdfe5` modifies only env.test.ts, not env.ts source.

**Verdict:** TRUE with high confidence. The source changes in `src/proxy.ts`, `src/lib/security/env.ts`, and `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` were never `git add`-ed during cycle 1.

### H2: "The unstaged changes are leftovers from a prior cycle that wasn't fully committed either"
**Evidence:** `git stash list` shows 5 stashes; topmost is "tle-verify wip". None match these source changes specifically. The changes match cycle-1 plan task B (analytics time reconciliation, partial) plus introduction of `getAuthSessionCookieNames` factory.

**Verdict:** Possible but more likely cycle 1 itself. Either way, cycle 2 must commit them.

### H3: "Test for getAuthSessionCookieNames passes because of Vitest module mocking auto-discovery"
**Evidence:** Vitest with `vi.mock` resolves the mock factory; the production code's missing export doesn't affect proxy.test.ts because the import is replaced with the mock. So tests in `tests/unit/security/env.test.ts` (which test the REAL exports) would fail at HEAD because the function doesn't exist there.

Trace: at HEAD, run `tests/unit/security/env.test.ts` → vitest imports `@/lib/security/env` → tries `getAuthSessionCookieNames()` → ReferenceError (function not defined).

**Verdict:** TRUE — running env.test.ts at HEAD would fail. Working tree has the function defined, so it passes.

### H4: "Analytics route staleness optimization regresses if working-tree change reverts"
**Evidence:** Working tree at line 62 uses `Date.now()`. HEAD (per `git show`) at the same line uses `await getDbNowMs()`. So the perf optimization is in the working tree only, not at HEAD.

So the working tree IS introducing two concrete behavioral changes:
1. Cache-hit fast path: from DB-time read to Date.now() read.
2. Cooldown failure fallback: try DB-time, fallback to Date.now() if DB unreachable.

**Verdict:** Behavioral changes confirmed. They should be committed.

## Findings (from traces)

### TRC2-1: [HIGH] Three source-file changes in working tree must be committed, otherwise CI breaks at HEAD
Already covered by VER2-1, ARCH2-1, CR2-1. Multi-lane convergence.

### TRC2-2: [MEDIUM] Cooldown-fallback chain has 4 possible time paths
**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:88-90`
**Confidence:** HIGH

Trace:
1. Refresh succeeds → `getDbNowMs()` succeeds → `createdAt` written in DB time. Subsequent stale check uses `Date.now()`, mixing domains.
2. Refresh succeeds → `getDbNowMs()` fails → outer catch fires, sets `_lastRefreshFailureAt` (via inner try/catch).
3. Refresh fails → outer catch → tries `getDbNowMs()` → succeeds → cooldown set in DB time. Subsequent cooldown check uses `Date.now()`.
4. Refresh fails → outer catch → tries `getDbNowMs()` → fails → cooldown set with `Date.now()` (working tree only).

Path #2 is interesting: refresh fresh data is computed (cost paid) but the post-write `getDbNowMs()` failure means `_lastRefreshFailureAt` is set as a failure timestamp (same as outright refresh failure), which means a successful refresh that just couldn't get a DB timestamp will trigger a cooldown anyway. Wasteful but acceptable.

**Fix:** Reorder: compute fresh, then `await getDbNowMs()` ONCE, then set cache. Or accept that DB time is best-effort for the createdAt.

## Confidence

H1, H3 high. H4 confirms working-tree changes are real and behavioral.
