# Cycle 12b Performance Reviewer Report

**Date:** 2026-04-20
**Base commit:** feeb4a30

## Inventory of Reviewed Files

- `src/app/(dashboard)/dashboard/groups/[id]/page.tsx` — group detail with N `new Date()` calls in map
- `src/app/(dashboard)/dashboard/contests/page.tsx` — contest listing
- `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx` — student dashboard
- `src/app/(public)/submissions/page.tsx` — public submissions with period filter
- `src/lib/assignments/active-timed-assignments.ts` — sidebar timed assignments
- `src/lib/assignments/contests.ts` — contest status calculation
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE events
- `src/app/api/v1/admin/backup/route.ts` — backup route
- `src/app/api/v1/admin/migrate/export/route.ts` — export route

## Findings

### PERF-1: [LOW] `groups/[id]/page.tsx` creates `new Date()` inside `.map()` callback — unnecessary per-iteration allocation

- **Confidence:** HIGH
- **Files:** `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:304`
- **Description:** The group detail page creates `const now = new Date()` inside a `.map()` callback that runs for each assignment. While this is a trivial allocation (sub-nanosecond), it's better practice to create the Date once before the map and reuse it. More importantly, this is the same clock-skew issue as the other `new Date()` findings — the variable should come from `getDbNow()`.
- **Failure scenario:** Minor — each iteration creates a new Date object. The real issue is the clock-skew risk, not the performance.
- **Fix:** Move the Date creation outside the `.map()` and use `getDbNow()`.

### PERF-2: [LOW] `student-dashboard.tsx` makes sequential DB queries that could be partially parallelized

- **Confidence:** MEDIUM
- **Files:** `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx:27-95`
- **Description:** The student dashboard makes: (1) progress stats query, (2) language stats query, (3) recent submissions + student assignments in parallel. Queries 1 and 2 are independent and could run in parallel with each other and with the parallel group at line 59. Currently there are two sequential rounds.
- **Failure scenario:** Minor latency increase on the student dashboard page.
- **Fix:** Combine all independent queries into a single `Promise.all` round.

## Previously Fixed (Verified)

- Cycle-27 AGG-6 (M3): Recruit page parallelization — correctly assessed as NOT APPLICABLE due to control flow dependencies.
