# Code Reviewer — RPF Loop Cycle 4 (2026-05-03)

**Scope:** repository at HEAD `7a195b11` against the cycle-3 baseline `dafc0b24`.
**Surface:** 8 commits since cycle-3 baseline — 6 source/test code commits + 2
plan housekeeping commits. Source reach:
- `src/lib/db/pre-restore-snapshot.ts` (stat-failure log split, CYC3-AGG-1)
- `src/lib/assignments/scoring.ts` (NaN guard CYC3-AGG-6, JSDoc lead-with-contract CYC3-AGG-4)
- `src/lib/assignments/recruiting-results.ts` (NEW pure helper, CYC3-AGG-2)
- `src/app/(auth)/recruit/[token]/results/page.tsx` (helper call-site, CYC3-AGG-2)
- `tests/unit/db/pre-restore-snapshot.test.ts` (NEW, CYC3-AGG-3)
- `tests/unit/data-retention-maintenance.test.ts` (extended with isolation test, CYC3-AGG-5)
- `tests/unit/assignments/scoring.test.ts` (NaN test added)
- `tests/unit/assignments/recruiting-results.test.ts` (NEW, CYC3-AGG-2)

## Verification of cycle-3 close-out at HEAD

- **CYC3-AGG-1 (stat-failure log split):** `src/lib/db/pre-restore-snapshot.ts:99-110`
  now branches on `stStat === null` and emits a distinct `warn` line —
  operators can distinguish "stat failed" from "actually empty file". RESOLVED.
- **CYC3-AGG-2 (recruit-results extract):** `src/lib/assignments/recruiting-results.ts:53-71`
  is a pure typed helper consumed at `src/app/(auth)/recruit/[token]/results/page.tsx:196-197`.
  Tests at `tests/unit/assignments/recruiting-results.test.ts:13-124` (8 cases)
  cover the cycle-1 C1-AGG-2 regression scenario, perfect runs, missing
  submissions, null score, default-points, and clamping. RESOLVED.
- **CYC3-AGG-3 (snapshot test):** `tests/unit/db/pre-restore-snapshot.test.ts:75-183`
  exercises file mode 0o600, filename pattern, `RETAIN_LAST_N=5` prune, unlink-on-error,
  and the success info-log structure without needing Postgres. RESOLVED.
- **CYC3-AGG-4 (JSDoc lead):** `src/lib/assignments/scoring.ts:66-100` reorders to
  contract-first, then defence-in-depth, then rejection list. The non-exhaustive
  blocklist (TRUNCATE/GRANT/REVOKE/MERGE/CALL/LOCK) is now explicitly documented.
  RESOLVED.
- **CYC3-AGG-5 (retention isolation test):** `tests/unit/data-retention-maintenance.test.ts:113-150`
  asserts `Promise.allSettled` semantics — at least 5 `db.execute` calls
  despite a forced rejection on the first call, plus the warn-log line.
  RESOLVED.
- **CYC3-AGG-6 (NaN guard):** `src/lib/assignments/scoring.ts:32-34` added the
  `Number.isFinite` early return; test at `tests/unit/assignments/scoring.test.ts:57-64`
  pins NaN, +Infinity, -Infinity all returning 0. RESOLVED.
- **CYC3-AGG-7 (blocklist incomplete):** Documented as defence-in-depth in the
  CYC3-AGG-4 JSDoc rewrite; deferral closed by documentation. RESOLVED-via-doc.

All 7 cycle-3 NEW findings are closed at HEAD. No regression introduced.

## NEW findings this cycle

### CR4-1: [LOW] `recruiting-results.ts` parameter ordering subtly couples to the page's local Map type

- **File:** `src/lib/assignments/recruiting-results.ts:53-56`
- **Code:**
  ```ts
  export function computeRecruitResultsTotals(
    assignmentProblemRows: ReadonlyArray<RecruitProblemRow>,
    bestByProblem: ReadonlyMap<string, RecruitBestSubmission>,
  ): RecruitResultsTotals
  ```
- **Description:** The page builds `bestByProblem` as
  `Map<string, (typeof submissionRows)[number]>` (a much wider type with
  `executionTimeMs`, `memoryUsedKb`, `submittedAt`, etc.). It is passed to a
  helper expecting `ReadonlyMap<string, RecruitBestSubmission>` — the Map
  is reused for the per-problem rendering as well. Today TypeScript widens
  the structural fit, but if a future maintainer adds a required field to
  `RecruitBestSubmission`, the page's wider Map will still type-check
  unless the field is also in the page's submission row.
- **Confidence:** LOW (defensive nicety; not a bug)
- **Failure scenario:** Future change adds `attemptCount: number` to
  `RecruitBestSubmission`. Helper logic uses it. Page does not project the
  field into its Map and the helper silently sees `undefined`.
- **Fix:** Either narrow the helper input by accepting only `score: number | null`
  (already the case) and document "callers MUST not assume any other field is
  read", or narrow at the call-site by mapping to `{score}` before invoking.
  Optional polish.

### CR4-2: [LOW] `pre-restore-snapshot.test.ts` retention test relies on millisecond-resolution mtime ordering

- **File:** `tests/unit/db/pre-restore-snapshot.test.ts:108-133`
- **Description:** The retention test inserts a 5ms `setTimeout` between
  snapshots so that the prune sort order is deterministic. On a slow CI
  runner, this provides millisecond resolution, but on filesystems with
  second-resolution mtime (older ext4, FAT, some Docker volumes) two
  snapshots could share the same mtime second, causing the prune sort
  to break ties unpredictably.
- **Confidence:** LOW (the test is run on macOS/Linux dev shells and CI
  containers with sub-second mtime)
- **Failure scenario:** Test flakes on a CI runner with second-resolution
  mtime, intermittently keeping 4 or 6 files instead of 5.
- **Fix:** Either bump the inter-snapshot sleep to 1.1s (slow), or sort by
  ISO stamp embedded in the filename (deterministic regardless of FS
  mtime resolution). The source's `pruneOldSnapshots` already sorts by
  `mtimeMs`, so changing the sort key in source would be a wider change.
  Recommend documenting the test assumption (`requires sub-second mtime`)
  and leaving as-is for now.

### CR4-3: [LOW] `data-retention-maintenance.test.ts` global timer leak risk between tests

- **File:** `tests/unit/data-retention-maintenance.test.ts:62-68`
- **Description:** `afterEach` deletes `globalThis.__sensitiveDataPruneTimer`
  but the source's local `pruneTimer` module-level variable is not reset
  between tests because each test re-imports via `vi.resetModules()` in
  `beforeEach`. This is correct — a fresh module instance has a fresh
  `pruneTimer = null`. The pattern is subtle and worth a comment in the
  test file so a future maintainer doesn't drop `vi.resetModules()` thinking
  it's redundant.
- **Confidence:** LOW (design correctness; documentation gap)
- **Fix:** Add a one-line comment near `vi.resetModules()` in `beforeEach`
  noting "required to reset the module-level pruneTimer; without this
  test cross-pollution returns".

### CR4-4: [LOW] Plan-status drift between `plans/done/` cycle-3 plan and `plans/open/` cycle-11 plan

- **File:** `plans/open/2026-04-29-rpf-cycle-11-review-remediation.md` (still
  in `plans/open/` despite reading "DONE" elsewhere)
- **Description:** The cycle-11 plan body says "Status: IN PROGRESS" while the
  current loop has now finished cycles 1-3 and is processing cycle 4. The
  cycle-11 plan is a leftover from a prior loop and conflicts with the
  current loop's plan structure. Cycle 10 housekeeping was supposed to clean
  this up but the file still sits in `plans/open/`.
- **Confidence:** MEDIUM (only documentation drift)
- **Fix:** During cycle-4 housekeeping, either archive `2026-04-29-rpf-cycle-11-review-remediation.md`
  to `plans/closed/` (it references prior-loop HEAD `7073809b` which is no
  longer reachable) or annotate the file body with a "superseded by current
  loop cycles 1-N" header. Defer if cycle-4 has no other writer-cycle work.

## Recommendations summary

| ID | Severity | Confidence | File | Suggested action |
|----|----------|------------|------|------------------|
| CR4-1 | LOW | MEDIUM | `recruiting-results.ts` | Document field-narrowing contract in JSDoc |
| CR4-2 | LOW | LOW | `pre-restore-snapshot.test.ts` | Document FS mtime resolution assumption |
| CR4-3 | LOW | LOW | `data-retention-maintenance.test.ts` | Add comment near `vi.resetModules()` |
| CR4-4 | LOW | MEDIUM | `plans/open/2026-04-29-...md` | Archive stale plan |

No HIGH or MEDIUM findings. The cycle-3 close-out commits are tight, well-tested,
and conventional-commits-compliant. Nothing else changed in source.
