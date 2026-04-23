# Cycle 12b Architect Review Report

**Date:** 2026-04-20
**Base commit:** feeb4a30

## Inventory of Reviewed Files

- `src/lib/auth/recruiting-token.ts` — token auth
- `src/lib/auth/config.ts` — auth config with JWT callbacks
- `src/lib/auth/types.ts` — type system
- `src/lib/db-time.ts` — DB time utilities
- `src/lib/assignments/contests.ts` — contest status calculation
- `src/lib/assignments/active-timed-assignments.ts` — sidebar timed assignments
- `src/app/(dashboard)/dashboard/contests/page.tsx` — contest listing
- `src/app/(dashboard)/dashboard/groups/[id]/page.tsx` — group detail
- `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx` — assignment detail
- `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx` — student dashboard
- `src/app/(public)/submissions/page.tsx` — public submissions
- `src/app/api/v1/admin/migrate/export/route.ts` — export route
- `src/app/api/v1/admin/backup/route.ts` — backup route

## Findings

### ARCH-1: [MEDIUM] Systemic `new Date()` in server components — architectural pattern not enforced

- **Confidence:** HIGH
- **Files:** `src/lib/assignments/contests.ts:33`, `src/app/(dashboard)/dashboard/contests/page.tsx:95`, `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:304`, `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx:120`, `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx:24`
- **Description:** While the recruit page and API routes were fixed to use `getDbNow()` / `getDbNowUncached()` / `SQL NOW()`, several server components still use `new Date()` for deadline/startsAt comparisons. This is an architectural consistency issue — the DB-time pattern was established but not applied comprehensively. The `getContestStatus` function has a default parameter `now: Date = new Date()` that makes it easy to accidentally use app-server time.
- **Failure scenario:** Each new feature that compares against DB-stored deadlines has to remember to use `getDbNow()`. Without enforcement, it's easy to forget, leading to a patchwork of clock-skew fixes.
- **Fix:** (1) Remove the `new Date()` default from `getContestStatus` and `selectActiveTimedAssignments` so callers must be explicit. (2) Update all server component call sites to use `getDbNow()`. (3) Consider a lint rule or code comment convention that flags `new Date()` in server components that interact with DB data.

### ARCH-2: [LOW] `getDbNow()` adds a DB round-trip per server render — architectural tradeoff

- **Confidence:** MEDIUM
- **Files:** `src/lib/db-time.ts`
- **Description:** Each call to `getDbNow()` (even with React.cache deduplication) adds a `SELECT NOW()` query. When used in multiple server components on the same page, React.cache() deduplicates within a single render, but across different page loads this adds an extra query. For pages that already make DB queries, the overhead is negligible. For pages that don't otherwise need DB access, it's a new dependency.
- **Failure scenario:** A page that was previously DB-free now requires a DB connection. If the DB is slow, this adds latency to the page render.
- **Fix:** This is an accepted tradeoff for correctness. The latency impact of a single `SELECT NOW()` is sub-millisecond on a healthy DB connection. No action needed beyond documenting the tradeoff.

## Verified Safe

- `AUTH_USER_COLUMNS` + `createSuccessfulLoginResponse` pattern correctly centralizes auth field management.
- `AuthUserInput` type is clean without index signature.
- `getDbNow()` with React.cache() is a good architectural pattern for deduplication within a render.
