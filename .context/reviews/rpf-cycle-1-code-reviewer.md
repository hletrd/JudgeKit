# RPF Cycle 1 — Code Reviewer

**Date:** 2026-04-22
**Base commit:** b1271d6a
**Reviewer:** code-reviewer

## Inventory of Reviewed Files

- `src/components/contest/contest-quick-stats.tsx` (working tree: major refactor)
- `src/components/submission-list-auto-refresh.tsx` (working tree: concurrency fix)
- `src/components/contest/recruiting-invitations-panel.tsx` (working tree: error toast fix)
- `src/components/contest/leaderboard-table.tsx`
- `src/components/contest/contest-announcements.tsx`
- `src/components/contest/contest-clarifications.tsx`
- `src/components/exam/anti-cheat-monitor.tsx`
- `src/components/seo/json-ld.tsx`
- `src/components/submission-status-badge.tsx`
- `src/hooks/use-visibility-polling.ts`
- `src/hooks/use-source-draft.ts`
- `src/lib/formatting.ts`
- `src/lib/api/client.ts`
- `src/lib/submissions/status.ts`
- `src/app/api/v1/contests/[assignmentId]/stats/route.ts` (new file)
- `src/app/(public)/practice/problems/[id]/page.tsx`
- `src/app/(public)/contests/[id]/page.tsx`
- `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx`
- `messages/en.json`

## Findings

### CR-1: `contest-quick-stats.tsx` — stats response validation allows NaN [MEDIUM/MEDIUM]

**File:** `src/components/contest/contest-quick-stats.tsx:53-58`

**Description:** The response validation checks `typeof json.data.participantCount === "number"` for each field, but `NaN` has type `"number"` in JS. If the backend returns NaN, it passes the check and "NaN" is displayed.

**Fix:** Use `Number.isFinite()` instead of `typeof === "number"`.

### CR-2: `leaderboard-table.tsx` uses Math.round instead of formatScore (2 locations) [LOW/MEDIUM]

**File:** `src/components/contest/leaderboard-table.tsx:200,428`

**Description:** Two locations use `Math.round(score * 100) / 100` instead of `formatScore(score, locale)`. Bypasses locale-aware digit grouping.

**Fix:** Import `useLocale` and `formatScore`, replace both occurrences.

### CR-3: `submission-status-badge.tsx` uses Math.round instead of formatScore [LOW/MEDIUM]

**File:** `src/components/submission-status-badge.tsx:89`

**Description:** Tooltip body displays score using `Math.round(score * 100) / 100` instead of `formatScore(score, locale)`. Component already has `locale` prop and `formatNumber` imported.

**Fix:** Replace with `formatScore(score, locale)`.

### CR-4: Public pages use Math.round instead of formatScore (3 locations) [LOW/MEDIUM]

**File:** `src/app/(public)/practice/problems/[id]/page.tsx:523`, `src/app/(public)/contests/[id]/page.tsx:229,266`

**Description:** Multiple public pages use `Math.round(score * 100) / 100` instead of `formatScore`. These pages have `locale` available.

**Fix:** Import `formatScore` and use it with locale.

### CR-5: Stats API route SQL string interpolation of status list [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:79,102`

**Description:** `TERMINAL_SUBMISSION_STATUSES_SQL_LIST` is interpolated into SQL. Currently safe (hardcoded `as const` array). Defense-in-depth note only.

## Summary

| ID | Severity | Confidence | Description |
|----|----------|------------|-------------|
| CR-1 | MEDIUM | MEDIUM | Stats response validation allows NaN via typeof check |
| CR-2 | LOW | MEDIUM | leaderboard-table.tsx Math.round vs formatScore (2 locs) |
| CR-3 | LOW | MEDIUM | submission-status-badge.tsx Math.round vs formatScore |
| CR-4 | LOW | MEDIUM | Public pages Math.round vs formatScore (3 locs) |
| CR-5 | LOW | LOW | SQL interpolation of status list safe but fragile |
