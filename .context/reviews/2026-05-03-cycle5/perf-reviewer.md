# Performance Review — Cycle 5 (2026-05-03)

**HEAD reviewed:** `eb4429a5`

---

## C5-PERF-1 (MEDIUM, HIGH confidence) — Unbounded `SELECT DISTINCT language FROM submissions` on every public submissions page load

**File:** `src/app/(public)/submissions/page.tsx:140-146`

This query scans the entire `submissions` table to find distinct language values for the filter dropdown. As the table grows (10k+ rows), this becomes progressively slower. The query has no LIMIT and no index can make `SELECT DISTINCT` on an unindexed column fast.

**Fix:** Replace with a query against the language configuration (which is already cached via `getConfiguredSettings()` or `getEnabledCompilerLanguages()`). The language filter options should come from the configured/available languages, not from the submissions table.

---

## C5-PERF-2 (LOW, MEDIUM confidence) — Public submissions page makes two separate count + data queries

**File:** `src/app/(public)/submissions/page.tsx:184-220`

The page runs a `COUNT(*)` query first, then a separate data query with `LIMIT/OFFSET`. These could be combined using `COUNT(*) OVER()` window function (which the admin submissions page already uses via `_total`). This would save one DB round-trip per page load.

**Fix:** Use `count(*) over()` window function in the data query, matching the pattern in `src/app/api/v1/files/route.ts:174`.

---

## C5-PERF-3 (LOW, LOW confidence) — JWT callback queries DB on every token refresh

**File:** `src/lib/auth/config.ts:399-412`

The `jwt` callback queries `db.query.users.findFirst` on every JWT refresh (not just on sign-in). With session maxAge, this happens periodically for every active session. This is a known deferred item (D2/F5 from prior cycles) and not new.

**Status:** DEFERRED — auth-perf cycle needed for caching design.

---

## No new performance findings beyond prior cycle carries

The recruiting context ALS cache is well-designed and O(1) per request. The rate-limiting sidecar fast-path avoids unnecessary DB transactions. No memory leak patterns detected.
