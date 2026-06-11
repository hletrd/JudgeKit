# Critic — RPF Cycle 18

**Date:** 2026-04-20
**Base commit:** 2b415a81

## CRI-1: Inconsistent locale handling in number formatting across the codebase [MEDIUM/MEDIUM]

**Files:** `src/components/submission-status-badge.tsx:45`, `src/app/(public)/practice/problems/[id]/page.tsx:174`, `src/app/(public)/_components/public-problem-list.tsx:164`
**Description:** The codebase uses locale-aware formatting for dates (`formatDateTimeInTimeZone`, `formatDateInTimeZone`, `formatRelativeTimeFromNow`) but uses hardcoded locale or no locale for number formatting. `SubmissionStatusBadge.formatNumber` uses `toLocaleString("en-US")`, while `acceptanceRate` and `successRate` are formatted with `.toFixed(1)` which is locale-unaware. This is an inconsistency in the internationalization story.
**Concrete failure scenario:** While Korean and English both use the same number format for these specific cases, adding a locale with different digit grouping (e.g., Arabic, Hindi) would produce incorrect output. More immediately, the hardcoded "en-US" is a code smell that signals incomplete i18n coverage.
**Fix:** Create a shared `formatNumber(value, locale)` utility in `@/lib/datetime` (or a new `@/lib/format` module) and use it consistently.

## CRI-2: Practice page has significant code duplication between Path A (no progress filter) and Path B (progress filter) [LOW/MEDIUM]

**File:** `src/app/(public)/practice/page.tsx:231-517`
**Description:** The practice page component is ~713 lines long. The two main branches (Path A: no progress filter, Path B: progress filter) share significant logic for fetching stats, building problem objects, and mapping to list items. The success-rate sort within Path A has yet another sub-branch with near-duplicate logic.
**Concrete failure scenario:** A bug fix applied to one path is easily missed in the other. The function is difficult to understand and maintain due to its length and branching.
**Fix:** Extract shared data-mapping logic into a helper function. Consider splitting the page into smaller components or extracting query logic into a data-access module.

## CRI-3: `access-code-manager.tsx` constructs share URL using `window.location.origin` — locale-unaware [LOW/MEDIUM]

**File:** `src/components/contest/access-code-manager.tsx:126`
**Description:** `const url = `${window.location.origin}/dashboard/contests/join?code=${code}`;` constructs a URL that does not include the locale prefix. The rest of the app uses `buildLocalePath()` or `buildLocalizedHref()` for all internal links.
**Concrete failure scenario:** When the app is accessed in Korean locale, the share link points to `/dashboard/contests/join?code=...` instead of `/ko/dashboard/contests/join?code=...`. The link still works (Next.js falls back), but it bypasses the locale routing.
**Fix:** Use the locale from `useLocale()` and construct the URL with `buildLocalizedHref()` or at minimum prepend the locale segment.
