# Cycle 5 Review Remediation Plan

**Date:** 2026-05-11
**Review:** _aggregate-cycle-5.md (code-reviewer, security-reviewer, perf-reviewer, test-engineer)
**New findings:** 6 (1 MEDIUM, 5 LOW)
**Status:** Completed

---

## Findings Fixed This Cycle

### Task 1: Remove dead code `buildCodeSnapshotDiff` [M1 + L1]
- **Files:** `src/lib/code-snapshots/diff.ts`
- **Severity:** MEDIUM (OOM risk) + HIGH (dead code)
- **Description:** The `buildCodeSnapshotDiff` function and its types are exported but never imported. The LCS algorithm allocates O(n×m) memory which can crash the process on large files.
- **Fix:** Delete `src/lib/code-snapshots/diff.ts`. Verify no imports in `src/` or `tests/`.
- **Status:** DONE — committed `9005eea0`
- **Gate check:** eslint 0 errors, next build success, vitest 317 files passed

### Task 2: Move `getDbNowUncached()` out of transaction in judge/poll [L2]
- **Files:** `src/app/api/v1/judge/poll/route.ts:82`
- **Severity:** LOW
- **Description:** `getDbNowUncached()` executes a separate DB query inside a transaction that holds row locks, extending lock duration.
- **Fix:** Call `getDbNowUncached()` before `execTransaction`, passing the timestamp into the transaction closure.
- **Status:** DONE — committed `d06c5255`
- **Gate check:** eslint 0 errors, next build success, vitest 317 files passed

### Task 3: Remove client-controlled `file.type` from restore ZIP detection [L3]
- **Files:** `src/app/api/v1/admin/restore/route.ts:74-77`
- **Severity:** LOW
- **Description:** `isZipFile` trusts `file.type` which is client-controlled via multipart Content-Type header.
- **Fix:** Remove `file.type` checks from `isZipFile`; rely only on `file.name?.endsWith(".zip")`. The actual ZIP validation happens inside `restoreFilesFromZip`.
- **Status:** DONE — committed `9df1485e`
- **Gate check:** eslint 0 errors, next build success, vitest 317 files passed

### Task 4: Add `stopSharedPollTimer()` for graceful shutdown [L4]
- **Files:** `src/app/api/v1/submissions/[id]/events/route.ts:181-210`, `src/lib/audit/node-shutdown.ts`
- **Severity:** LOW
- **Description:** No exported function to stop the SSE shared poll timer, delaying graceful shutdown.
- **Fix:** Export `stopSharedPollTimer()` that clears `sharedPollTimer`. Call it from the shutdown handler in `node-shutdown.ts` alongside `stopSseCleanupTimer()`.
- **Status:** DONE — committed `55cc8a5b`
- **Gate check:** eslint 0 errors, next build success, vitest 317 files passed

### Task 5: Run `npm audit` for `isomorphic-dompurify` [L5]
- **Files:** N/A (dependency check)
- **Severity:** LOW
- **Description:** Verify DOMPurify is not vulnerable.
- **Fix:** Run `npm audit`. Upgrade if needed.
- **Status:** DONE — `npm audit` shows 0 vulnerabilities for `isomorphic-dompurify`/`dompurify`. Transitive PostCSS vulnerability in Next.js 16.2.3 deferred (no stable patch available yet; exit criterion: upgrade to Next.js >= 16.3.0 or patched postcss).
- **Gate check:** N/A (no code changes)

---

## Deferred Items

- **PostCSS/Next.js transitive vulnerability:** 12 npm audit findings (4 low, 7 moderate, 1 high), primarily PostCSS XSS via Next.js transitive dependency. Next.js latest stable (16.2.6) is still within affected range. Deferred until Next.js >= 16.3.0 stable or patched postcss is available.

---

## Gate Status

- [x] eslint — 0 errors, 0 warnings
- [x] next build — success
- [x] vitest — 317 files, 2399 tests passed
