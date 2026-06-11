# Cycle 12b Verifier Report

**Date:** 2026-04-20
**Base commit:** feeb4a30

## Inventory of Verified Behaviors

- `authorizeRecruitingToken` field completeness via `AUTH_USER_COLUMNS` + `createSuccessfulLoginResponse`
- `mustChangePassword` included in `AUTH_CORE_FIELDS` and queried from DB
- `AuthUserInput` type no longer has index signature
- `getDbNow()` / `getDbNowUncached()` correctly execute `SELECT NOW()`
- Recruit page uses `getDbNow()` for all temporal comparisons
- SSE `viewerId` captured before closure
- Rate limit `blockedUntil` pattern is consistent
- Backup route uses `getDbNowUncached()` for filename

## Findings

### V-1: [MEDIUM] Server component deadline comparisons use `new Date()` — verified inconsistency with API enforcement

- **Confidence:** HIGH
- **Files:** `src/app/(dashboard)/dashboard/contests/page.tsx:95`, `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:304`, `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx:120`, `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx:24`
- **Description:** I verified the data flow for each of these server components:
  1. `contests/page.tsx:95` — `const now = new Date()` is passed to `getContestStatus(c, now)` at line 101. The contest status determines which badge (upcoming/open/closed) is displayed.
  2. `groups/[id]/page.tsx:304` — `const now = new Date()` inside `.map()` is used for `isUpcoming` and `isPast` flags that determine the status badge.
  3. `assignments/[assignmentId]/page.tsx:120` — Same pattern as above.
  4. `student-dashboard.tsx:24` — `const now = new Date()` is used for `upcomingAssignments`, `openAssignments`, and `completedAssignments` filtering.
  
  In all cases, the API routes that enforce deadlines (e.g., submission routes) use `SQL NOW()` or `getDbNowUncached()`, so the display inconsistency does NOT lead to enforcement bypass. But the display can mislead users about what's actually possible.

- **Evidence of inconsistency:** The recruit page was fixed for the same class of issue (cycle 27 AGG-1) using `getDbNow()`. The fix was narrowly scoped to the recruit page only.
- **Fix:** Apply `getDbNow()` to all four server components.

### V-2: [LOW] `migrate/export` route filename uses `new Date()` while backup route uses `getDbNowUncached()`

- **Confidence:** HIGH
- **Files:** `src/app/api/v1/admin/migrate/export/route.ts:81`
- **Description:** I verified that `backup/route.ts:85-86` uses `getDbNowUncached()` for the filename timestamp, while `migrate/export/route.ts:81` uses `new Date()`. Both routes perform the same operation (database export with password re-confirmation) but with different timestamp sources.
- **Fix:** Use `getDbNowUncached()` in the export route to match the backup route.

## Verified Correct

- `authorizeRecruitingToken` at `src/lib/auth/recruiting-token.ts` correctly uses `AUTH_USER_COLUMNS` (line 28) and `createSuccessfulLoginResponse` (line 35), which includes `mapUserToAuthFields` (line 108 of config.ts). The `mustChangePassword` field is in `AUTH_CORE_FIELDS` (line 62 of config.ts) and will be queried from DB.
- `getDbNow()` at `src/lib/db-time.ts:18-24` correctly uses `rawQueryOne("SELECT NOW()::timestamptz AS now")` and throws if null.
- `getDbNowUncached()` at `src/lib/db-time.ts:33-39` is correctly provided for non-React contexts.
- `recruiting-invitations-panel.tsx:247` — `new Date()` usage is in a client component (has `"use client"` directive at top), which is acceptable since it runs in the browser, not the server.
