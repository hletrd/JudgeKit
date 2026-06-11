# Aggregate Review — Cycle 26

**Date:** 2026-04-25
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, architect, critic, verifier, test-engineer, debugger
**Total findings:** 9 (deduplicated to 3)

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [HIGH] `rateLimitedResponse` sidecar path uses `Date.now()` — cycle 25 AGG-3 fix was never applied

**Sources:** CR-1, S-1, A-1, C-1, V-1, D-1, TE-1 | **Confidence:** HIGH
**Cross-agent signal:** 7 of 8 review perspectives

The cycle 25 aggregate review identified that `rateLimitedResponse` uses `(nowMs ?? Date.now())` as a fallback, creating a clock-skew risk. The cycle 25 plan was marked "DONE" but the code was never changed. Line 123 still reads:

```ts
function rateLimitedResponse(windowMs?: number, nowMs: number = Date.now()) {
```

Two call sites (lines 162, 196) in the sidecar rejection paths omit `nowMs` entirely, falling back to `Date.now()`. This causes the `X-RateLimit-Reset` header to be computed from app-server time instead of DB-server time when the sidecar rejects a request, violating the repo's architectural invariant that all rate-limit and deadline comparisons use DB server time.

**Concrete failure scenario:** The app server clock is 5 seconds ahead of the DB server. A user hits the rate limit via the sidecar path. The `X-RateLimit-Reset` header is computed from `Date.now()` + windowMs, giving a reset time 5 seconds earlier than the actual DB window end. The client retries too early and gets rejected again.

**Fix:**
1. Make `nowMs` a required parameter in `rateLimitedResponse` (remove the `= Date.now()` default).
2. In `consumeApiRateLimit` (line 162) and `consumeUserApiRateLimit` (line 196): when the sidecar rejects, call `await getDbNowMs()` and pass the result as `nowMs`.
3. Add a test verifying the `X-RateLimit-Reset` header uses DB-consistent time in both the sidecar and DB rejection paths.

---

### AGG-2: [LOW] Analytics student progression and participant timeline use raw scores without late penalties

**Sources:** CR-2, CR-3, A-2, C-2, V-2, TE-2 | **Confidence:** MEDIUM
**Cross-agent signal:** 6 of 8 review perspectives

The `studentProgressions` chart in `contest-analytics.ts` (line 261) and the `bestScore` computation in `participant-timeline.ts` (line 229) use raw submission scores without applying late penalties. The leaderboard and status page use `buildIoiLatePenaltyCaseExpr` which correctly applies penalties. This creates observable inconsistency: an instructor comparing the progression total to the leaderboard total for the same student in an IOI contest with late penalties will see different numbers.

The gap is documented in comments (contest-analytics.ts lines 235-239) but represents a scoring inconsistency that could confuse instructors during grading.

**Fix:** Apply the same late-penalty logic used in `buildIoiLatePenaltyCaseExpr` to the analytics progression and timeline score computations. Alternatively, add a visible disclaimer in the analytics UI noting that progression totals are pre-penalty.

---

### AGG-3: [LOW] SSE stale connection cleanup uses O(n) linear scan

**Sources:** P-1, P-2 | **Confidence:** LOW
**Cross-agent signal:** 2 of 8 review perspectives

The SSE connection tracking cleanup iterates the entire `connectionInfoMap` to find stale entries. With `MAX_TRACKED_CONNECTIONS = 1000`, this is acceptable at current scale. Similarly, the in-memory rate limiter's eviction scan over 10,000 entries is fine. Not actionable now but worth noting for future scaling.

**Fix:** No action needed at current scale. If connection counts or rate-limit entries grow significantly, consider using a sorted data structure (min-heap by `createdAt`).

---

## Carried Forward from Prior Cycles

All prior DEFER items (DEFER-1 through DEFER-14 from cycle 24 plan) remain unchanged.

## Positive Observations

- All clock-skew-sensitive paths (contest boundaries, anti-cheat, DB rate limiting, SSE coordination, data retention) consistently use `getDbNowMs()` / `getDbNowUncached()` — except for the sidecar rejection path in `rateLimitedResponse` (AGG-1)
- `buildIoiLatePenaltyCaseExpr` is correctly shared between leaderboard, status page, and single-user live rank
- `createApiHandler` provides consistent middleware across all API routes
- No `eval()`, `new Function()`, `as any`, or `@ts-ignore` in server code
- DOMPurify sanitization is well-configured with narrow allowlists
- Password hashing uses Argon2id with OWASP-recommended parameters
- Batched DELETEs with inter-batch delays prevent WAL bloat
- SSE shared polling batches all active submissions into one DB query

## Process Note

Cycle 25 AGG-3 was marked as "DONE" in the plan but the fix was never applied to the code. This is a verification gap — the plan should have been validated against the actual code before closing. This cycle's AGG-1 re-identifies the same issue.
