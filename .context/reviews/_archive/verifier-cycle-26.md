# Verifier — Cycle 26

**Date:** 2026-04-25
**Scope:** Evidence-based correctness verification

---

## V-1: [HIGH] `rateLimitedResponse` sidecar path does not use DB-consistent time — VERIFIED

**File:** `src/lib/security/api-rate-limit.ts:123, 162, 196`
**Confidence:** HIGH (verified by code inspection)

Evidence:
- Line 123: `function rateLimitedResponse(windowMs?: number, nowMs: number = Date.now())` — default is `Date.now()`
- Line 162 (in `consumeApiRateLimit`): `return rateLimitedResponse(windowMs);` — omits `nowMs`, uses default
- Line 196 (in `consumeUserApiRateLimit`): `return rateLimitedResponse(windowMs);` — omits `nowMs`, uses default
- Line 167: `return rateLimitedResponse(windowMs, nowMs);` — DB path correctly passes `nowMs`
- Line 201: `return rateLimitedResponse(windowMs, nowMs);` — DB path correctly passes `nowMs`

The DB-authenticated paths (lines 167, 201) correctly pass `nowMs` from `atomicConsumeRateLimit`, which uses `getDbNowMs()`. But the sidecar rejection paths (lines 162, 196) skip the DB check and thus have no `nowMs` to pass, falling back to `Date.now()`.

The cycle 25 plan AGG-3 was marked DONE but the code was never modified. This is a verified regression in the plan-verification process.

---

## V-2: [LOW] Scoring consistency gap in analytics/timeline — VERIFIED

**Files:** `src/lib/assignments/contest-analytics.ts:261`, `src/lib/assignments/participant-timeline.ts:226-230`
**Confidence:** MEDIUM (verified by code inspection)

Evidence:
- `contest-analytics.ts:261`: `const rawScaledScore = sub.score != null ? Math.round(Math.min(Math.max(Number(sub.score), 0), 100) / 100 * Number(sub.points) * 100) / 100 : 0;` — raw score, no late penalty
- `participant-timeline.ts:229`: `return Math.max(best, submission.score);` — raw score, no late penalty
- `contest-scoring.ts:181`: Uses `buildIoiLatePenaltyCaseExpr` — applies late penalties
- `submissions.ts:571`: Uses `buildIoiLatePenaltyCaseExpr` — applies late penalties

Both analytics and timeline use raw scores while the leaderboard and status page apply late penalties. The gap is documented in comments (analytics lines 235-239) but creates observable inconsistency.
