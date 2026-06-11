# Cycle 12b Debugger Report

**Date:** 2026-04-20
**Base commit:** feeb4a30

## Inventory of Reviewed Files

- `src/app/(dashboard)/dashboard/groups/[id]/page.tsx` — deadline display in `.map()` callback
- `src/app/(dashboard)/dashboard/contests/page.tsx` — contest status
- `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx` — assignment filtering
- `src/app/api/v1/admin/migrate/export/route.ts` — export filename timestamp
- `src/app/api/v1/admin/backup/route.ts` — backup filename timestamp (correctly uses DB time)
- `src/lib/assignments/contests.ts` — getContestStatus function
- `src/lib/assignments/active-timed-assignments.ts` — selectActiveTimedAssignments

## Findings

### DBG-1: [MEDIUM] Server components use `new Date()` for deadline comparisons — latent clock-skew bug

- **Confidence:** HIGH
- **Files:** `src/app/(dashboard)/dashboard/contests/page.tsx:95`, `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:304`, `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx:120`, `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx:24`
- **Description:** Same finding as other agents. Four server components use `new Date()` for temporal comparisons against DB-stored deadlines. Under clock skew, the displayed status will disagree with the actual DB state.
- **Failure mode:** If the app server clock drifts ahead of the DB server clock, pages will show assignments/contests as "closed" earlier than they actually are. If the app server clock drifts behind, pages will show them as "open" longer than they should be. The API enforcement is correct (uses SQL NOW()), so this is a display-only inconsistency, not an enforcement bypass.
- **Fix:** Use `getDbNow()` in all four server components.

### DBG-2: [LOW] `groups/[id]/page.tsx` creates `new Date()` inside `.map()` — each iteration gets a slightly different timestamp

- **Confidence:** MEDIUM
- **Files:** `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:304`
- **Description:** The `new Date()` call is inside a `.map()` callback. While the time difference between iterations is negligible (microseconds), this is technically a non-deterministic comparison — an assignment could flip from "upcoming" to "open" between two consecutive iterations if the startsAt timestamp happens to fall in that microsecond window. This is an extremely unlikely edge case but represents a conceptual bug.
- **Failure scenario:** An assignment's `startsAt` is exactly `new Date()` minus a few microseconds. The first iteration's `new Date()` returns a time before `startsAt` (showing "upcoming"), but by the time the next iteration runs, `new Date()` returns a time after `startsAt` (showing "open"). The user sees inconsistent status badges for assignments with the exact same deadline.
- **Fix:** Create the `now` value once before the `.map()` call and use `getDbNow()`.

## Previously Fixed (Verified)

- Cycle-27 AGG-3: SSE `viewerId` captured before closure — no more non-null assertion across closure boundary.
