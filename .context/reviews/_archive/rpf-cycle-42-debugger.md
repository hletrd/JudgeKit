# RPF Cycle 42 — Debugger

**Date:** 2026-04-23
**Base commit:** 8912b987
**Reviewer angle:** Latent bug surface, failure modes, regressions

## Findings

### DBG-1: `problemPoints` array length mismatch silently defaults to 100 points [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/quick-create/route.ts:89`

**Description:** When `problemPoints` is provided but shorter than `problemIds`, the `?? 100` fallback at line 89 silently assigns default points. This is a latent bug that would manifest as incorrect scoring. The root cause is missing schema-level validation. Unlike a null/undefined default (which is clearly intentional), a mismatched array length is almost always a caller bug.

**Failure mode:** Frontend sends `{ problemIds: ["a","b","c"], problemPoints: [10,20] }`. Problem "c" gets 100 points instead of the intended value. No error is returned. The bug is only discoverable by reviewing the created contest's scoring.

**Fix:** Add `.refine()` to schema.

**Confidence:** Medium

---

### DBG-2: `invitation.userId!` non-null assertion is safe but fragile [LOW/LOW]

**File:** `src/lib/assignments/recruiting-invitations.ts:253`

**Description:** The `!` assertion at line 253 depends on the guard at line 230. If line 230 is ever refactored (e.g., the null check is moved to a different function or removed during a refactor), the assertion would mask a null pointer error. The type system could narrow this automatically without the assertion.

**Fix:** Remove `!` — TypeScript can narrow after the guard.

**Confidence:** Low

---

## Sweep: Files Reviewed

All critical files as listed in other reviewer reports, with focus on failure mode analysis.
