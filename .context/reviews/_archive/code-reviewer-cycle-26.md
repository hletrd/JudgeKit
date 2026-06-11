# Code Reviewer — Cycle 26

**Date:** 2026-04-25
**Scope:** Full repository

---

## CR-1: [HIGH] `rateLimitedResponse` still uses `Date.now()` default — cycle 25 AGG-3 fix was not applied

**File:** `src/lib/security/api-rate-limit.ts:123`
**Confidence:** HIGH

The cycle 25 aggregate review identified that `rateLimitedResponse` uses `(nowMs ?? Date.now())` as a fallback, creating a clock-skew risk. The plan was marked DONE but the fix was never applied — line 123 still reads:

```ts
function rateLimitedResponse(windowMs?: number, nowMs: number = Date.now()) {
```

Furthermore, there are two call sites that omit `nowMs` entirely (lines 162, 196), both in the sidecar rejection path. When the sidecar rejects a request, the `X-RateLimit-Reset` header is computed using `Date.now()` instead of DB server time, which can be inaccurate by seconds if the app and DB servers have clock skew.

**Concrete failure scenario:** The app server clock is 5 seconds ahead of the DB server. A user hits the rate limit via the sidecar path. The `X-RateLimit-Reset` header is computed from `Date.now()` + windowMs, giving a reset time 5 seconds earlier than the actual DB window end. The client may retry too early and get rejected again, or a monitoring system comparing reset headers across instances may flag inconsistency.

**Fix:** Make `nowMs` required (no default). Update lines 162 and 196 to pass `await getDbNowMs()` as the `nowMs` argument. Since both callers are already async, this is a straightforward change.

---

## CR-2: [LOW] `contest-analytics.ts` student progression chart does not apply late penalties

**File:** `src/lib/assignments/contest-analytics.ts:241-277`
**Confidence:** MEDIUM

The `studentProgressions` computation uses raw scores (`score / 100 * points`) without applying late penalties, and the code has a comment acknowledging this on line 235-239. While documented, this creates a confusing user experience: a student's progression total may exceed their leaderboard total for IOI contests with late penalties. The comment says "A future enhancement could apply late penalties here for full consistency with the leaderboard."

This is not a bug (it's documented behavior) but represents an inconsistency in the data displayed to instructors that could cause confusion during grading.

---

## CR-3: [LOW] `participant-timeline.ts` bestScore does not apply late penalties

**File:** `src/lib/assignments/participant-timeline.ts:226-230`
**Confidence:** MEDIUM

The `bestScore` in the participant timeline is computed from raw submission scores without applying late penalties, unlike the leaderboard and status page which use `buildIoiLatePenaltyCaseExpr`. This means the "best score" shown in the participant timeline may differ from the score shown in the leaderboard for windowed exams or IOI contests with late penalties.

---

## No other significant findings

The codebase is well-structured with consistent use of `getDbNowMs()`/`getDbNowUncached()` for all clock-skew-sensitive paths. The `buildIoiLatePenaltyCaseExpr` canonical scoring function is correctly shared between leaderboard, status page, and single-user live rank. Input validation uses Zod schemas throughout. Error handling is consistent and robust.
