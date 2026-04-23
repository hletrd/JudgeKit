# Cycle 12b Critic Review Report

**Date:** 2026-04-20
**Base commit:** feeb4a30

## Inventory of Reviewed Files

All files listed in the code-reviewer, security-reviewer, perf-reviewer, and architect reports were examined from a multi-perspective critique angle.

## Findings

### CRI-1: [MEDIUM] Incomplete clock-skew remediation — the fix was applied narrowly to the recruit page but not to the broader pattern

- **Confidence:** HIGH
- **Files:** Multiple server components (see code-reviewer CR-1 through CR-4)
- **Description:** The DB-time fix (cycle 27 AGG-1) was applied only to the recruit page, but the same `new Date()` pattern exists in at least 4 other server components that compare against DB-stored deadlines. The fix addressed the specific instance but not the systemic issue. This is a pattern where individual fixes create a false sense of security — the codebase appears to use DB time because the most visible instance was fixed, but the underlying pattern persists.
- **Failure scenario:** A student sees inconsistent deadlines across different pages — the contest page shows "closed" but the group detail page shows "open" — because only some pages use DB time.
- **Fix:** Apply `getDbNow()` consistently across all server components that compare against DB-stored temporal data.

### CRI-2: [LOW] `getContestStatus` default parameter `now: Date = new Date()` is a footgun

- **Confidence:** HIGH
- **Files:** `src/lib/assignments/contests.ts:33`
- **Description:** The default parameter makes it easy to call `getContestStatus(contest)` without providing a `now` value, which silently uses app-server time. The function has no JSDoc explaining that `now` should come from `getDbNow()` in server components. This is the same class of issue as the original `new Date()` problem — the API design makes the wrong thing easy and the right thing require extra work.
- **Failure scenario:** A developer adds a new page that calls `getContestStatus` without providing `now`, reintroducing clock-skew.
- **Fix:** Either remove the default (requiring explicit `now`), or change the default to throw in server contexts with a helpful error message.

### CRI-3: [LOW] `student-dashboard.tsx` uses `new Date()` for display-only filtering — lower severity than deadline enforcement

- **Confidence:** MEDIUM
- **Files:** `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx:24,97-107`
- **Description:** The student dashboard uses `new Date()` to split assignments into "upcoming", "open", and "completed" categories. This is display-only filtering — the actual submission acceptance/rejection is handled by API routes that use DB time. The worst case is a brief miscounting of assignments in each category, which self-corrects when the page is refreshed.
- **Failure scenario:** A student sees "3 open assignments" but one has actually closed. They click through and see the correct "closed" status on the assignment detail page.
- **Fix:** Use `getDbNow()` for consistency, but the practical impact is lower than the deadline enforcement pages.

## Positive Observations

- The auth module centralization (AUTH_USER_COLUMNS, mapUserToAuthFields) is well-designed and prevents field mismatch bugs.
- The `getDbNow()` / `getDbNowUncached()` pattern with React.cache() is architecturally sound.
- The recruiting token auth now properly flows through the same `createSuccessfulLoginResponse` path as credential auth.
