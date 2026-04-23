# RPF Cycle 1 — Verifier

**Date:** 2026-04-22
**Base commit:** b1271d6a
**Reviewer:** verifier

## Inventory of Reviewed Files

- `src/components/contest/contest-quick-stats.tsx` (working tree)
- `src/components/submission-list-auto-refresh.tsx` (working tree)
- `src/components/contest/recruiting-invitations-panel.tsx` (working tree)
- `src/app/api/v1/contests/[assignmentId]/stats/route.ts` (new)
- `messages/en.json` (working tree)
- `src/hooks/use-visibility-polling.ts`
- `src/lib/formatting.ts`

## Findings

### V-1: Working tree fixes for AGG-1, AGG-2, AGG-3, AGG-6 are correctly implemented [CONFIRMED]

**Description:** Verified against the plan in `plans/open/2026-04-22-rpf-cycle-1-review-remediation.md`:
- TASK-1 (AGG-1): `SubmissionListAutoRefresh` now uses `isRunningRef` guard and `async start()` pattern. Correct.
- TASK-2 (AGG-2): `contest-quick-stats.tsx` now uses `/stats` endpoint, `initialLoadDoneRef`, and `formatNumber`. Correct.
- TASK-3 (AGG-3): `recruiting-invitations-panel.tsx` now shows error toasts for revoke/delete. i18n keys added. Correct.
- TASK-5 (AGG-6): `SubmissionListAutoRefresh` now uses `apiFetch` instead of raw `fetch`. Correct.

### V-2: `contest-quick-stats.tsx` — `formatNumber` called with positional locale string uses legacy API path [LOW/LOW]

**File:** `src/components/contest/contest-quick-stats.tsx:80,86,104`

**Description:** Three calls use `formatNumber(value, locale)` which hits the legacy positional path in `formatNumber` (line 30 of formatting.ts: `typeof optionsOrLocale === "string"`). The fourth call on line 95 uses the options object form `formatNumber(stats.avgScore, { locale, maximumFractionDigits: 1 })`. Both paths work correctly but mixing them is slightly inconsistent.

**Fix:** Use the options object form consistently: `formatNumber(value, { locale })`.

### V-3: Stats API route returns `avgScore` as string when COALESCE is used [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:91`

**Description:** `COALESCE(ROUND(AVG(ut.total_score), 1), 0)` in PostgreSQL returns a `numeric` type. When this is serialized to JSON via the Node.js pg driver, `ROUND()` returns a string representation, not a JavaScript number. This means `json.data.avgScore` could be the string `"85.5"` instead of the number `85.5`. The frontend check `typeof json.data.avgScore === "number"` would then fall back to `prev.avgScore`, which could show stale data.

**Concrete failure scenario:** A contest with submissions where avgScore is non-integer (e.g., 85.5). The pg driver serializes `ROUND(AVG(...), 1)` as `"85.5"` (string). Frontend `typeof "85.5" === "number"` is false, so it falls back to the previous value. The avg score never updates from initial 0.

**Fix:** Cast the SQL result: `COALESCE(ROUND(AVG(ut.total_score), 1), 0)::float` or use `::int` for the count fields, or validate with `Number()` conversion on the frontend.

**Confidence:** Medium — depends on the pg driver version and configuration. Some drivers/configs return numbers for `numeric` type.

## Summary

| ID | Severity | Confidence | Description |
|----|----------|------------|-------------|
| V-3 | MEDIUM | MEDIUM | Stats API avgScore may serialize as string from PostgreSQL ROUND() |
