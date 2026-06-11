# Test Engineer — RPF Loop Cycle 4 (2026-05-03)

**Scope:** Cycle-3 close-out test deltas at HEAD `7a195b11`.

## Test deltas this cycle

| File | Lines | Cases added | Coverage |
|------|-------|-------------|----------|
| `tests/unit/db/pre-restore-snapshot.test.ts` | 183 (NEW) | 5 | mode 0o600, filename pattern, prune retention, unlink-on-error, info-log shape |
| `tests/unit/assignments/recruiting-results.test.ts` | 124 (NEW) | 8 | empty, regression scenario, perfect, missing, null, default-points, negative clamp, > 100 clamp |
| `tests/unit/data-retention-maintenance.test.ts` | +39 | 1 (extending existing 3 cases) | failure-isolation contract |
| `tests/unit/assignments/scoring.test.ts` | +9 | 1 | NaN/+Inf/-Inf returns 0 |

Total: +15 unit test cases; cycle-3 plan reports 2256 unit tests pass.

## Quality of the new tests

### `pre-restore-snapshot.test.ts`
- **Mocks well-scoped:** `vi.hoisted` declares mocks before the dynamic
  `import("@/lib/db/pre-restore-snapshot")` so the source uses the mocked
  exports. Correct.
- **Clean setup/teardown:** `mkdtempSync` per-test, `rmSync({force:true})`
  after — robust against partial-write tests.
- **Real ReadableStream:** uses `new ReadableStream({...})` to match the
  prod return type, not a hand-rolled stub. Correct.
- **Filename pattern test:** regex
  `/^pre-restore-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-abcdef01\.json$/`
  pins the format. If the source changes the timestamp shape (e.g.,
  removes milliseconds) the test fails clearly.
- **Mtime sort assumption:** the retention test assumes sub-second mtime
  resolution. On macOS/Linux/CI containers this is satisfied. NFS or older
  FAT volumes would fail. See CR4-2 / PERF4-1.
- **Unlink-on-error test:** verifies `partial.length === 0` AND
  `loggerError` was called. Solid.

### `recruiting-results.test.ts`
- **Pure-function tests:** zero external dependencies, instant. Correct.
- **Regression scenario explicit:** the cycle-1 C1-AGG-2 scenario
  (3×25-point at 80%/60%/100% → 60/75) is the second test case with an
  explicit comment citing the regression. Tests-as-documentation done well.
- **Edge cases:** null score, missing submission, default points, negative
  clamp, > 100 clamp. All covered.
- **Type imports:** test imports the public interface types
  (`RecruitProblemRow`, `RecruitBestSubmission`) so the contract is
  pinned at the type level too.

### `data-retention-maintenance.test.ts` extension
- **`Promise.allSettled` semantics asserted:** `mockImplementationOnce`
  rejects the first call, then asserts >= 5 total `db.execute` calls.
  This is the load-bearing assertion.
- **Warn-log content asserted:** the test verifies the warn message
  matches `"Failed to prune one of the sensitive data tables"` AND that
  the structured `err.message` contains the simulated reason. Strong.
- **Drizzle-orm stub:** the test stubs `lt`, `and`, `or`, `inArray`,
  `notInArray`, and the `sql` template tag with plain-object returns.
  Correct for a unit test that only counts invocations.

### `scoring.test.ts` NaN test
- Three explicit non-finite cases (NaN, +Inf, -Inf). Correct.
- Pin location: `tests/unit/assignments/scoring.test.ts:57-64`.

## NEW findings this cycle

### TE4-1: [LOW] No integration test for the recruit-results page using the helper

- **File:** missing — tests only cover the helper, not the call-site
- **Description:** The CYC3-AGG-2 extract pins the math behind the helper,
  but the page-level integration (Map shape, sort order, hide-when-zero
  guard) is not exercised by a server-component-rendered test.
  Playwright e2e env-blocked under DEFER-ENV-GATES.
- **Confidence:** LOW (the helper is pure and unit-tested; the page
  reduction is a 10-line obvious loop)
- **Failure scenario:** Page-level regression e.g., a `Map.get` with the
  wrong key — would not be caught by the helper unit test.
- **Fix:** When E2E env unblocks, add a Playwright recruit-results page
  test that renders a fixture assignment and asserts the candidate-facing
  total. Defer until DEFER-ENV-GATES exit.

### TE4-2: [LOW] `pre-restore-snapshot.test.ts` does not exercise the chmod-failure-on-dir path

- **File:** `tests/unit/db/pre-restore-snapshot.test.ts`
- **Description:** TASK-3's plan listed "Mocked chmod failure on dir does
  not abort the snapshot" as one of the assertions. The test file does
  not include this case (only 5 of the planned 5+ cases are present, all
  of them other paths). The chmod best-effort path at
  `pre-restore-snapshot.ts:67-72` is exercised on the happy path (chmod
  succeeds) but the warn-log line on chmod failure is unverified.
- **Confidence:** LOW (the chmod path is best-effort; failure is rare)
- **Fix:** Add a 6th `it()` that uses `vi.spyOn(fsPromises, "chmod").mockRejectedValue(...)`
  to verify the snapshot still writes successfully and the warn-log is
  emitted. Polish, defer.

### TE4-3: [LOW] `recruiting-results.test.ts` has no tie-breaking case

- **File:** `tests/unit/assignments/recruiting-results.test.ts`
- **Description:** The page builds `bestByProblem` by iterating
  `submissions.score ASC` and keeping the highest score (ties resolve to
  earliest). The helper accepts the resulting Map but does not see the
  tie-breaking step itself. The page-level reduction at
  `page.tsx:174-186` is untested.
- **Confidence:** LOW (the helper's contract is "what is in the map";
  the page handles tie-breaking)
- **Fix:** Add a page-level test (Playwright when env unblocks) for the
  tie-break case. Or, if a future cycle moves the tie-breaking into the
  helper, add a unit test then.

## Recommendations summary

| ID | Severity | Confidence | File | Action |
|----|----------|------------|------|--------|
| TE4-1 | LOW | LOW | recruit-results page-level | Defer until E2E env unblocks |
| TE4-2 | LOW | LOW | `pre-restore-snapshot.test.ts` | Add chmod-fail case (polish) |
| TE4-3 | LOW | LOW | `recruiting-results.test.ts` | Defer (page-level concern) |

The cycle-3 test additions are well-targeted and pin the contract behind
each fix. No HIGH/MEDIUM gaps; the LOW gaps are all known deferrals or
polish items.
