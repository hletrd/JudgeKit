# Document Specialist Review — RPF Cycle 19

**Date:** 2026-04-20
**Reviewer:** document-specialist
**Base commit:** 77da885d

## Findings

### DOC-1: `formatNumber` JSDoc references `.toFixed()` as deprecated pattern but codebase still uses `.toFixed()` extensively [LOW/MEDIUM]

**Files:** `src/lib/datetime.ts:58-61`
**Description:** The JSDoc for `formatNumber` states "Prefer this over `.toLocaleString("en-US")` or `.toFixed()` for any user-facing number display." However, 15+ `.toFixed()` calls remain in the codebase. The documentation implies a policy that is not enforced.
**Fix:** Either (a) update the JSDoc to be more nuanced (e.g., "prefer for locale-aware display; `.toFixed()` is acceptable for admin-only and technical displays"), or (b) create a tracking issue to systematically migrate public-facing `.toFixed()` calls.

### DOC-2: `DROPDOWN_ICONS` JSDoc in public-header.tsx correctly references `DROPDOWN_ITEM_DEFINITIONS` — bidirectional reference is maintained [INFO/N/A]

**Description:** Verified that the JSDoc comments in `public-header.tsx` (line 57) and `public-nav.ts` properly cross-reference each other. The bidirectional reference established in commit e4644ac2 is intact.
