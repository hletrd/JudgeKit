# Document Specialist Review — Cycle 39

**Date:** 2026-04-23
**Reviewer:** document-specialist
**Base commit:** c176d8f5

## DOC-1: `recruiting-constants.ts` JSDoc says "~10 years" but the actual value is 10 * 365.25 days [LOW/LOW]

**File:** `src/lib/assignments/recruiting-constants.ts:7`

**Description:** The JSDoc comment says "10 tropical years, accounting for leap days" which is accurate for `10 * 365.25 * 24 * 60 * 60 * 1000`. This was flagged in prior cycles as deferred (DOC-1). The comment is technically correct but could be more precise (e.g., "10 tropical years ≈ 3652.5 days").

**Confidence:** Low (already deferred)

---

## DOC-2: Bulk route lacks documentation for the case-insensitive dedup strategy [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:40-56`

**Description:** The bulk route's case-insensitive email dedup query (added in cycle 38) has inline comments explaining the approach, but there is no module-level documentation describing the dedup strategy. This was flagged in prior cycles as deferred (DOC-2).

**Confidence:** Low (already deferred)

---

## DOC-3: `computeExpiryFromDays` JSDoc says "whole days" but `expiryDays` can be fractional if bypassing Zod [LOW/LOW]

**File:** `src/lib/assignments/recruiting-constants.ts:19-21`

**Description:** The function's JSDoc says "adding whole days to a base timestamp", but the function itself does not enforce integer input. If called with a fractional `expiryDays` value, it would compute a partial-day expiry. All current callers pass integer values (enforced by Zod schemas), so this is not a practical issue.

**Fix:** Either add `Math.floor(expiryDays)` in the function or update the JSDoc to say "adding day(s)".

**Confidence:** Low (no practical impact)

---

## No Critical Doc-Code Mismatches Found

The code comments and JSDoc are generally accurate and up-to-date. The recent changes (computeExpiryFromDays extraction, case-insensitive dedup) have appropriate inline documentation.
