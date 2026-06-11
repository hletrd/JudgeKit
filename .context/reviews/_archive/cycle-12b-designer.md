# Cycle 12b Designer Review Report

**Date:** 2026-04-20
**Base commit:** feeb4a30

## Inventory of Reviewed UI/UX Files

- `src/app/(dashboard)/dashboard/contests/page.tsx` — contest listing with status badges
- `src/app/(dashboard)/dashboard/groups/[id]/page.tsx` — group detail with assignment status
- `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx` — assignment detail
- `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx` — student dashboard
- `src/components/contest/recruiting-invitations-panel.tsx` — invitation status badges
- `src/components/layout/public-header.tsx` — navigation header
- `src/app/(auth)/recruit/[token]/page.tsx` — recruit page (confirmed using DB time)
- `src/app/(public)/submissions/page.tsx` — public submissions page
- `src/app/(public)/users/[id]/page.tsx` — user profile with activity heatmap

## Findings

### DES-1: [LOW] Inconsistent deadline display precision across pages

- **Confidence:** MEDIUM
- **Files:** `src/app/(dashboard)/dashboard/contests/page.tsx`, `src/app/(dashboard)/dashboard/groups/[id]/page.tsx`, `src/app/(auth)/recruit/[token]/page.tsx`
- **Description:** The recruit page uses `formatDateTimeInTimeZone()` for the deadline display (line 228), which respects the user's locale and timezone. The contests page and group detail page use `formatDateTimeInTimeZone()` as well. However, the `student-dashboard.tsx` uses `formatRelativeTimeFromNow()` for upcoming assignment deadlines, which is a different presentation format. While both are valid, the mixing of absolute and relative time formats could confuse users who navigate between pages.
- **Failure scenario:** A student sees "closes in 2 hours" on the dashboard but "2026-04-20 14:00" on the assignment detail page. They need to mentally convert between formats.
- **Fix:** Consider standardizing on one format or showing both (e.g., "closes in 2 hours (Apr 20, 2:00 PM)").

### DES-2: [LOW] `recruiting-invitations-panel.tsx:253` uses `toLocaleDateString` for date formatting — not using shared datetime utility

- **Confidence:** MEDIUM
- **Files:** `src/components/contest/recruiting-invitations-panel.tsx:253`
- **Description:** The invitation panel's `formatDate` function uses `new Date(dateStr).toLocaleDateString(locale, {...})` instead of the shared `formatDateTimeInTimeZone` utility. This could produce inconsistent formatting compared to other date displays in the app.
- **Failure scenario:** Dates in the invitations panel look slightly different from dates in other parts of the UI (e.g., different timezone handling).
- **Fix:** Use `formatDateTimeInTimeZone()` for consistency.

## Verified Fixed from Previous Cycles

- Recruit page deadline display uses `formatDateTimeInTimeZone` with user locale (cycle 27 M1).
- Korean letter-spacing remediation is comprehensive — all headings use CSS custom properties.
- Mobile menu structure is functional with proper navigation items.
