# Architecture Review — RPF Cycle 4 (Loop 4/100)

**Date:** 2026-04-24
**Reviewer:** architect
**Base commit:** a717b371

## Inventory of Reviewed Files

- `src/lib/security/api-rate-limit.ts`
- `src/lib/security/rate-limit.ts`
- `src/lib/security/in-memory-rate-limit.ts`
- `src/lib/security/rate-limiter-client.ts`
- `src/lib/realtime/realtime-coordination.ts`
- `src/lib/assignments/leaderboard.ts`
- `src/lib/assignments/contest-scoring.ts`
- `src/lib/assignments/participant-status.ts`
- `src/lib/db-time.ts`
- `src/lib/api/handler.ts`
- `src/app/api/v1/judge/claim/route.ts`
- `src/app/api/v1/submissions/[id]/events/route.ts`
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`
- `src/proxy.ts`

## Findings

### ARCH-1: Judge claim route clock-skew — NOW FIXED [RESOLVED]

**File:** `src/app/api/v1/judge/claim/route.ts:126`

**Status:** Fixed. Line 126 now uses `getDbNowUncached()`.

---

### ARCH-2: Manual routes duplicate `createApiHandler` boilerplate [MEDIUM/MEDIUM — carry-over]

**Description:** SSE route and judge routes cannot use `createApiHandler` due to streaming/custom response types, and duplicate the auth/rate-limit/error-handling boilerplate. Stable pattern; refactor risk exceeds benefit.

**Status:** Carry-over.

---

### ARCH-3: Stale-while-revalidate cache pattern duplication [LOW/LOW — carry-over]

**Description:** Same stale-while-revalidate pattern duplicated across `contest-scoring.ts` and `analytics/route.ts`. A shared utility would reduce duplication.

**Status:** Carry-over.

---

### ARCH-4: No lint guard against `Date.now()` in DB transactions [LOW/MEDIUM — new observation]

**Description:** The `Date.now()` clock-skew class of bugs keeps recurring because there is no linting or compile-time guard against it. The codebase has an established pattern: use `getDbNowUncached()` for all temporal comparisons that interact with DB-stored timestamps. A custom ESLint rule or wrapper function that enforces DB time would prevent future regressions.

**Note:** This is not a code bug but an architectural observation about a systemic risk. The existing `Date.now()` call sites in DB-transaction contexts have been systematically fixed, but new code could reintroduce the pattern without a guard.

**Fix:** Consider adding a `no-Date-now-in-transaction` ESLint rule or a wrapper `getDbNowMs()` convenience function.

**Confidence:** MEDIUM

---

## New Findings

**One new architectural observation** (ARCH-4): no lint guard against `Date.now()` in DB transactions. This is LOW/MEDIUM severity — not a current bug but a systemic risk that could prevent future regressions of a known bug class. All prior architectural findings remain valid as carry-overs.
