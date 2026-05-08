# Document Specialist Review — Cycle 4

**Date:** 2026-05-03
**HEAD reviewed:** `11d9b33a`
**Focus:** Doc/code mismatches against authoritative sources

---

## C4-DOC-1 (LOW, MEDIUM confidence) — `sql.raw(FAILED_REDEEM_ATTEMPTS_KEY)` usage lacks safety documentation

**File:** `src/lib/assignments/recruiting-invitations.ts:70`

The JSDoc for `incrementFailedRedeemAttempt` explains the TOCTOU fix but does not mention that `sql.raw()` is used intentionally with a hardcoded constant. A developer reviewing this code might flag it as a potential SQL injection vector. A brief comment explaining why `sql.raw` is safe here would prevent false-positive security reviews.

**Fix:** Add a comment: `// sql.raw is safe here: FAILED_REDEEM_ATTEMPTS_KEY is a module-level constant, not user input.`

---

## C4-DOC-2 (LOW, LOW confidence) — Privacy page hardcoded retention periods (carry-forward from C3-DOC-1)

The cycle 3 finding noted that retention periods are hardcoded. Cycle 3 added a code comment (commit `de11b03a`) documenting that they must be kept in sync, which partially addresses the issue. No further action this cycle.
