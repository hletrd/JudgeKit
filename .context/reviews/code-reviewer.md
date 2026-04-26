# Code-Reviewer Pass — RPF Cycle 2/100

**Date:** 2026-04-26
**Lane:** code-reviewer
**Scope:** Full repo, prioritising changes since last cycle (proxy.ts, env.ts, analytics route, anti-cheat-monitor.tsx)

## Summary

Working tree contains 3 unstaged source changes (`src/proxy.ts`, `src/lib/security/env.ts`, `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`) plus committed cycle-1 test/refactor commits. The unstaged changes implement parts of cycle-1 plan tasks B (analytics time reconciliation) and an unspecified `getAuthSessionCookieNames` introduction in production code. **These source changes need to be committed; otherwise the committed tests reference functions that don't exist in HEAD.**

## Findings

### CR2-1: [HIGH] `getAuthSessionCookieNames` exists in test mock and code review aggregate but is uncommitted in production code
**File:** `src/lib/security/env.ts:172-180`, `src/proxy.ts:7,92`
**Confidence:** HIGH

The cycle-1 commit `c915da0b` added `getAuthSessionCookieNames` to the test mock factory in `tests/unit/proxy.test.ts`, and aggregate AGG-1 says proxy now calls this function. But the function definition in `src/lib/security/env.ts` and the import + call in `src/proxy.ts` are **uncommitted** (working-tree-only) at HEAD.

Verify with: `git show HEAD:src/proxy.ts | grep -c getAuthSessionCookieNames` returns 0; `grep -c getAuthSessionCookieNames src/proxy.ts` returns 2.

**Failure scenario:** If the working-tree changes are lost (e.g. `git stash` accidentally, branch reset), the production code at HEAD would fail to start because `proxy.ts` would not have the function it needs. Tests at HEAD would also fail because they mock a function that doesn't exist in the real export.

**Fix:** Commit the working-tree source changes for env.ts, proxy.ts, and the analytics route in separate commits per concern.

### CR2-2: [MEDIUM] Analytics route mixes time domains in cooldown fallback path
**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:62-91`
**Confidence:** MEDIUM

The new code uses `Date.now()` for the staleness check (line 62) but `await getDbNowMs()` for cache writes (line 79, 88, 106) and `Date.now()` only as a final-fallback (line 90). This creates an asymmetric model where cache `createdAt` is written in DB-time domain and cooldown reads use `Date.now()`, leaving a small clock-skew window.

If app server clock drifts +5s relative to DB:
- Just-written `createdAt` (DB time) appears 5s in the past from `Date.now()` perspective — `age` is overstated by 5s. With `STALE_AFTER_MS=30s`, that's a 16% overcount, still within tolerance.
- Cooldown `lastFailure` written in DB time appears 5s in the past too — cooldown released 5s early. With 5s cooldown, it could be released immediately on next request.

**Failure scenario:** Marginal but real: under sustained DB time skew, the failure cooldown is essentially nullified, allowing the thundering herd it was meant to prevent.

**Fix:** Apply Option 1 from cycle-1 aggregate AGG-2 — use `Date.now()` consistently for both reads and writes of cache/cooldown timestamps. The 30s and 5s tolerances are well above plausible NTP drift.

### CR2-3: [MEDIUM] Outer `.catch(() => {})` swallows unhandled rejections AND any sync errors silently
**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:96-99`
**Confidence:** MEDIUM

The async IIFE at line 76 wraps everything in try/catch/finally with an additional outer `.catch(() => {})`. The defensive outer catch is intended to catch `getDbNowMs()` failures inside `.catch()` or `.finally()`, but it also silently swallows ANY unexpected synchronous throw inside the IIFE.

**Fix:** Replace `.catch(() => {})` with `.catch((err) => logger.warn({ err, assignmentId }, "[analytics] background refresh outer rejection — defensive swallow"))`. Preserves diagnostic without crashing the process.

### CR2-4: [LOW] `_refreshingKeys` and `_lastRefreshFailureAt` use leading-underscore convention inconsistently
**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:20,24`
**Confidence:** LOW

Leading-underscore signals intent ("private") but is inconsistent with the rest of the file. Either drop the underscore or unify into a `RefreshState` object.

**Fix:** Defer; cosmetic.

### CR2-5: [LOW] `RETRY_BASE_DELAY_MS` 30s clamp is unreachable with current `MAX_RETRIES=3`
**File:** `src/components/exam/anti-cheat-monitor.tsx:122-124`
**Confidence:** LOW

With `MAX_RETRIES=3`, `maxRetry` ranges 0..3, so backoff is `1000 * 2^maxRetry` = 1000, 2000, 4000, 8000ms. The `Math.min(..., 30_000)` clamp is dead defensive code. Comment says backoff is `min(2^maxRetry * RETRY_BASE_DELAY_MS, 30s)` which misleads.

**Fix:** Tighten comment or raise `MAX_RETRIES` to 5+. Defer.

### CR2-6: [LOW] `tests/unit/proxy.test.ts` mock uses `vi.fn().mockReturnValue` but function is rarely called per test
**File:** `tests/unit/proxy.test.ts:51-58` (per cycle-1 commit `c915da0b`)
**Confidence:** LOW

A plain function mock works. `vi.fn` adds spy capability nobody currently uses.

**Fix:** Defer; current pattern is fine.

## Verification Notes

- `tests/unit/proxy.test.ts` and `tests/unit/security/env.test.ts` confirmed via `npm run test:unit` — 2210/2210 pass.
- `npm run lint` — 0 errors, 14 warnings in untracked .mjs scripts (not gating).
- `npm run build` — passes.
- Anti-cheat refactor in `5cde234e` is clean — `aria-hidden="true"`, doc comment, dep array all correct.

## Confidence

- HIGH: CR2-1 (uncommitted source code mismatch).
- MEDIUM: CR2-2, CR2-3 (analytics time domain & error swallowing).
- LOW: CR2-4..6 (style/refactor opportunities).
