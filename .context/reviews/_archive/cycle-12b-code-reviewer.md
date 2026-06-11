# Cycle 12b Code Reviewer Report

**Date:** 2026-04-20
**Base commit:** feeb4a30

## Inventory of Reviewed Files

- `src/lib/auth/recruiting-token.ts` — confirmed cycle-12 fixes in place
- `src/lib/auth/config.ts` — AUTH_USER_COLUMNS, mapUserToAuthFields, createSuccessfulLoginResponse
- `src/lib/auth/types.ts` — AuthUserInput no longer has index signature
- `src/lib/db-time.ts` — getDbNow, getDbNowUncached
- `src/lib/assignments/contests.ts` — getContestStatus with default `new Date()`
- `src/lib/assignments/active-timed-assignments.ts` — selectActiveTimedAssignments
- `src/app/(dashboard)/dashboard/groups/[id]/page.tsx` — server component using `new Date()`
- `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx` — server component using `new Date()`
- `src/app/(dashboard)/dashboard/contests/page.tsx` — server component using `new Date()`
- `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx` — server component using `new Date()`
- `src/app/(public)/submissions/page.tsx` — server component using `new Date()` for period filter
- `src/app/api/v1/admin/migrate/export/route.ts` — `new Date()` for filename timestamp
- `src/app/api/v1/admin/backup/route.ts` — correctly uses `getDbNowUncached()`
- `src/lib/security/rate-limit.ts` — confirmed `blockedUntil > 0` pattern consistent
- `src/components/contest/recruiting-invitations-panel.tsx` — client component with `new Date()`
- `src/lib/security/sanitize-html.ts` — DOMPurify usage
- `src/lib/ops/admin-health.ts` — `new Date()` for health timestamp

## Findings

### CR-1: [MEDIUM] Server component `contests/page.tsx` uses `new Date()` for contest status instead of DB time

- **Confidence:** HIGH
- **Files:** `src/app/(dashboard)/dashboard/contests/page.tsx:95`, `src/lib/assignments/contests.ts:33`
- **Description:** The contests page calls `getContestStatus(c, now)` at line 101 where `now = new Date()` (app server clock). The recruit page was fixed to use `getDbNow()` for the same class of temporal comparisons. If the app server clock drifts from the DB server clock, contest status labels (upcoming/open/closed) may disagree with the actual DB-stored deadlines.
- **Failure scenario:** A contest with a deadline of 12:00 DB time, but the app server clock is 12:01. The contest shows as "closed" on the page, but the API still accepts submissions.
- **Fix:** Use `getDbNow()` and pass it to `getContestStatus`.

### CR-2: [MEDIUM] Server component `groups/[id]/page.tsx` uses `new Date()` for assignment status labels

- **Confidence:** HIGH
- **Files:** `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:304-308`
- **Description:** The group detail page calculates `isUpcoming` and `isPast` using `new Date()` inside a `.map()` callback. Each iteration creates a fresh `new Date()`, though within the same render they'll be practically identical. The real issue is clock-skew: these status labels may disagree with the actual deadline state.
- **Failure scenario:** An assignment deadline has just passed according to the DB, but the app server clock is behind — the page shows the assignment as still "open" when submissions are actually rejected.
- **Fix:** Call `getDbNow()` once at the top of the component and use it for all comparisons.

### CR-3: [MEDIUM] Server component `assignments/[assignmentId]/page.tsx` uses `new Date()` for assignment status

- **Confidence:** HIGH
- **Files:** `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx:120-124`
- **Description:** Same pattern as CR-1/CR-2. The assignment detail page calculates `isUpcoming` and `isPast` using `new Date()`.
- **Failure scenario:** Same as CR-2 — status labels can disagree with DB-stored deadlines under clock skew.
- **Fix:** Use `getDbNow()` for temporal comparisons.

### CR-4: [MEDIUM] Server component `student-dashboard.tsx` uses `new Date()` for deadline filtering

- **Confidence:** HIGH
- **Files:** `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx:24,97-107`
- **Description:** The student dashboard filters assignments into "upcoming", "open", and "completed" using `new Date()`. Under clock skew, the student may see different assignment counts than what the API considers valid.
- **Failure scenario:** A student sees an assignment in "upcoming" that has actually opened according to DB time, causing confusion about when to start.
- **Fix:** Use `getDbNow()` for the deadline comparisons.

### CR-5: [LOW] `getContestStatus` and `selectActiveTimedAssignments` default to `new Date()` — encourages clock-skew usage

- **Confidence:** HIGH
- **Files:** `src/lib/assignments/contests.ts:33`, `src/lib/assignments/active-timed-assignments.ts:17`
- **Description:** Both functions have `now: Date = new Date()` as a default parameter. While callers can pass DB time, the default makes it easy to accidentally use app-server time. The `getActiveTimedAssignmentsForSidebar` wrapper correctly uses `getDbNow()`, but direct callers may not.
- **Failure scenario:** A future developer calls `getContestStatus(contest)` without providing `now`, reintroducing clock-skew.
- **Fix:** Remove the default parameter or make it require explicit `now` argument, with a code comment explaining why DB time should be used.

### CR-6: [LOW] `migrate/export` route uses `new Date()` for filename instead of DB time

- **Confidence:** MEDIUM
- **Files:** `src/app/api/v1/admin/migrate/export/route.ts:81`
- **Description:** The export route uses `new Date().toISOString()` for the filename, while the backup route (same module area) was fixed to use `getDbNowUncached()`. The export filename timestamp could differ from the backup filename timestamp by the clock-skew amount.
- **Failure scenario:** An admin creates a backup and an export in quick succession. The filenames have slightly different timestamps because one uses DB time and the other uses app-server time.
- **Fix:** Use `getDbNowUncached()` for the filename timestamp, matching the backup route pattern.

### CR-7: [LOW] `admin-health.ts` uses `new Date()` for health snapshot timestamp

- **Confidence:** LOW
- **Files:** `src/lib/ops/admin-health.ts:53`
- **Description:** The health endpoint timestamp uses `new Date().toISOString()`. This is a status/monitoring endpoint, so clock-skew impact is minimal. But for consistency with the DB-time approach used elsewhere, it could be improved.
- **Failure scenario:** The health timestamp differs slightly from DB-stored event timestamps. Not a functional issue.
- **Fix:** Consider using DB time for consistency, or document that app-server time is intentional for health checks.

## Previously Fixed (Verified)

- Cycle-12 AGG-1: `authorizeRecruitingToken` now uses `AUTH_USER_COLUMNS` and `createSuccessfulLoginResponse` — VERIFIED
- Cycle-12 AGG-2: `mustChangePassword` is now part of `AUTH_CORE_FIELDS` and queried from DB — VERIFIED
- Cycle-12 AGG-4: `AuthUserInput` no longer has `[key: string]: unknown` index signature — VERIFIED
- Cycle-12 AGG-6: `blockedUntil > 0 ? blockedUntil : null` pattern is now consistent — VERIFIED
- Cycle-27 AGG-1: Recruit page now uses `getDbNow()` — VERIFIED
- Cycle-27 AGG-3: SSE `viewerId` captured before closure — VERIFIED
