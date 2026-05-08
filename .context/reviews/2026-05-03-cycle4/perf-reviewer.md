# Performance Review — Cycle 4

**Date:** 2026-05-03
**HEAD reviewed:** `11d9b33a`
**Focus:** Performance, concurrency, CPU/memory/UI responsiveness

---

## C4-PERF-1 (LOW, MEDIUM confidence) — Public submissions page runs unbounded `selectDistinct` for language filter

**File:** `src/app/(public)/submissions/page.tsx:140-146`

```ts
const availableLanguageRows = await db
  .selectDistinct({ language: submissions.language })
  .from(submissions)
  .orderBy(asc(submissions.language));
```

This `SELECT DISTINCT language FROM submissions` query runs on every page load with no limit. As the submissions table grows, this will become progressively slower. The number of distinct languages is bounded by the number of configured language configs (typically < 30), so the result set is small, but the full-table scan on `submissions` is unnecessary.

**Fix:** Query `languageConfigs` (or the cached config) instead of `submissions` for the language filter options. This table is much smaller and has a predictable cardinality.

---

## C4-PERF-2 (LOW, LOW confidence) — `getPeriodStart` uses `new Date()` app-server time, not DB time

**File:** `src/app/(public)/submissions/page.tsx:65-86`

The `getPeriodStart` function creates `Date` objects using `new Date()` (app server time) for the "today", "week", and "month" period filters. The main query later joins with `getDbNow()` for the count. If the app server clock is slightly ahead of or behind the DB server clock, submissions near the period boundary may be included or excluded inconsistently. The same pattern exists in other pages (practice, rankings).

**Fix:** Derive period start from the DB time value already fetched at line 162 instead of using `new Date()`. Low priority because the typical clock skew is < 1 second.
