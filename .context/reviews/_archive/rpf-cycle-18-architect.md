# Architect — RPF Cycle 18

**Date:** 2026-04-20
**Base commit:** 2b415a81

## ARCH-1: Practice page component exceeds 700 lines — needs decomposition [MEDIUM/MEDIUM]

**File:** `src/app/(public)/practice/page.tsx` (713 lines)
**Description:** The practice page is the largest server component in the `(public)` route group. It handles search, tag filtering, difficulty range filtering, sort options, progress filtering, pagination, and JSON-LD generation all in one component. The data-fetching logic alone spans ~300 lines with two major branches (Path A and Path B) that share significant mapping logic.
**Concrete failure scenario:** Adding a new filter or sort option requires understanding and modifying a 700-line component. The risk of introducing bugs in one path while modifying another is high.
**Fix:** Extract the data-fetching and filtering logic into a dedicated data-access module (e.g., `src/lib/practice/data.ts`). The page component should only handle rendering. This also makes the query logic testable in isolation.

## ARCH-2: No shared number formatting utility — locale-aware date formatting exists but number formatting is ad-hoc [LOW/MEDIUM]

**Files:** `src/components/submission-status-badge.tsx:45`, `src/lib/datetime.ts`
**Description:** The codebase has a well-structured `@/lib/datetime` module with locale-aware date/time formatting utilities (`formatDateTimeInTimeZone`, `formatDateInTimeZone`, `formatRelativeTimeFromNow`). However, there is no equivalent module for number formatting. Number formatting is done ad-hoc with `toLocaleString("en-US")` or `.toFixed()`.
**Concrete failure scenario:** Adding a locale with different number formatting requirements requires hunting down and updating every `toLocaleString` or `.toFixed` call.
**Fix:** Create a `formatNumber(value, locale)` utility in `@/lib/datetime` or a new `@/lib/format` module, mirroring the pattern of the datetime utilities.

## ARCH-3: Workspace-to-public migration progress — remaining Phase 4 items [INFO]

**File:** `plans/open/2026-04-19-workspace-to-public-migration.md`
**Description:** The migration is in Phase 4, with "Remove redundant page components under `(dashboard)` where public counterparts exist" still remaining. The `(workspace)` route group has been eliminated, and the `(control)` route group has been merged into `(dashboard)`. The PublicHeader now shows role-appropriate dropdown items. Remaining work is to remove dashboard duplicate pages that have public counterparts.
**Risk:** Low — the remaining work is cleanup, not architectural.
