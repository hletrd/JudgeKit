# Test Engineer — Cycle 26

**Date:** 2026-04-25
**Scope:** Test coverage and quality

---

## TE-1: [MEDIUM] No test verifying `rateLimitedResponse` uses DB-consistent time in sidecar path

**File:** `src/lib/security/api-rate-limit.ts:123, 162, 196`
**Confidence:** HIGH

There is no test that verifies the `X-RateLimit-Reset` header in the sidecar rejection path uses DB-consistent time. Since the fix for cycle 25 AGG-3 was never applied, there's also no regression test that would have caught this. A test should:

1. Mock the sidecar to return `true` (rate limited)
2. Verify that `rateLimitedResponse` is called with a `nowMs` derived from `getDbNowMs()`
3. Verify the `X-RateLimit-Reset` header value matches `Math.ceil((dbNowMs + windowMs) / 1000)`

---

## TE-2: [LOW] No test verifying scoring consistency between analytics progression and leaderboard

**File:** `src/lib/assignments/contest-analytics.ts`
**Confidence:** LOW

There is no integration test verifying that the student progression total in analytics matches the leaderboard total for IOI contests with late penalties. The current behavior (raw scores in analytics vs. adjusted scores in leaderboard) is documented but untested. A test would make the intentional inconsistency explicit and catch unintended regressions.

---

## Positive test observations

- Vitest suite: 2194 tests all passing
- Test coverage for the scoring module covers both windowed and non-windowed exam late penalties
- The `buildIoiLatePenaltyCaseExpr` function has source-grep tests verifying its usage across query files
