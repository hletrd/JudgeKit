# Architect — Cycle 26

**Date:** 2026-04-25
**Scope:** Full repository

---

## A-1: [MEDIUM] `rateLimitedResponse` sidecar path lacks DB-consistent time — architectural inconsistency

**File:** `src/lib/security/api-rate-limit.ts:123, 162, 196`
**Confidence:** HIGH

(Duplicates CR-1 / S-1 from architectural angle.) The architecture has a clear invariant: all rate-limit and deadline comparisons use DB server time (`getDbNowMs()`). The `rateLimitedResponse` function violates this invariant by defaulting to `Date.now()`, and two callers (sidecar rejection paths) rely on the default. This breaks the architectural consistency of the time-source layering.

The fix is straightforward: make `nowMs` required and update all callers. The sidecar path should fetch `getDbNowMs()` before calling `rateLimitedResponse`, or the sidecar check should return `nowMs` as part of its result.

---

## A-2: [LOW] Analytics and timeline modules bypass canonical scoring pipeline

**Files:** `src/lib/assignments/contest-analytics.ts:235-277`, `src/lib/assignments/participant-timeline.ts:226-230`
**Confidence:** MEDIUM

The analytics (student progression) and participant timeline modules compute scores from raw submission data without applying late penalties, while the leaderboard and status page use the canonical `buildIoiLatePenaltyCaseExpr`. This represents a divergence in the scoring pipeline architecture. While both are documented with comments acknowledging the gap, they create an architectural debt: instructors see different score totals depending on which view they use. A future refactor could extract a shared `computeAdjustedScore()` function that both SQL-level and TypeScript-level callers use.

---

## Positive architectural observations

- Clean separation of concerns: `buildIoiLatePenaltyCaseExpr` is the single SQL-level source of truth for scoring
- `createApiHandler` provides consistent middleware (auth, CSRF, rate limiting, validation) across all API routes
- `getDbNowMs()`/`getDbNowUncached()` are consistently used for all deadline and rate-limit comparisons
- Realtime coordination properly uses advisory locks and DB time
- Data retention pruning uses batched deletes with WAL-friendly batch sizes
- The sidecar + DB two-tier rate limiting architecture is well-designed with correct fail-open behavior
