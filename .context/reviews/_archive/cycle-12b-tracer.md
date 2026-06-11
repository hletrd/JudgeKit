# Cycle 12b Tracer Report

**Date:** 2026-04-20
**Base commit:** feeb4a30

## Causal Traces

### Flow 1: Deadline comparison in server components — clock-skew data flow

**Trace:**
1. User navigates to `/dashboard/contests`
2. `contests/page.tsx:95` — `const now = new Date()` captures app-server time
3. `contests/page.tsx:101` — `getContestStatus(c, now)` determines contest status
4. `getContestStatus(contests.ts:33)` — compares `nowMs` against `contest.deadline.getTime()`
5. If app-server clock is ahead of DB clock, a contest with deadline exactly at DB "now" will show as "closed" even though the DB still considers it "open"
6. User clicks into the contest and tries to submit
7. API route uses `SQL NOW()` for deadline enforcement — submission may succeed, contradicting the "closed" status shown on the listing page

**Hypothesis:** Clock-skew between app server and DB server causes display inconsistency in contest/assignment status.
**Evidence:** The recruit page had the exact same issue and was fixed with `getDbNow()` in cycle 27. The fix was narrowly scoped to the recruit page only.
**Confidence:** HIGH

### Flow 2: Export filename timestamp vs backup filename timestamp

**Trace:**
1. Admin clicks "Export" — `migrate/export/route.ts:81` — `const timestamp = new Date().toISOString()` for filename
2. Admin clicks "Backup" — `backup/route.ts:85-86` — `const dbNow = await getDbNowUncached(); const timestamp = dbNow.toISOString()` for filename
3. If both operations run at the same wall-clock moment but the app-server clock differs from the DB clock by 5 seconds, the filenames will differ by ~5 seconds
4. This is a minor consistency issue — the file contents are correct, only the timestamp label differs

**Hypothesis:** Two routes performing the same logical operation use different time sources for their output filenames.
**Evidence:** Direct code comparison of `migrate/export/route.ts:81` vs `backup/route.ts:85-86`.
**Confidence:** HIGH

### Flow 3: `getContestStatus` default parameter footgun

**Trace:**
1. Developer adds a new feature that needs contest status
2. Developer calls `getContestStatus(contest)` without providing `now` parameter
3. Default `now: Date = new Date()` kicks in — uses app-server time
4. Under clock-skew, the status is incorrect
5. No test catches this because there are no tests for `getContestStatus`

**Hypothesis:** The default parameter makes it easy to accidentally reintroduce clock-skew bugs.
**Evidence:** The recruit page was fixed for this exact class of issue. The `getContestStatus` function's default parameter is the same anti-pattern.
**Confidence:** MEDIUM
