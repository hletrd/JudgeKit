# Document Specialist — RPF Loop Cycle 4 (2026-05-03)

**Lens:** doc/code mismatches against authoritative sources.

## Doc audit of cycle-3 close-out

### `src/lib/db/pre-restore-snapshot.ts`

Module-level JSDoc (lines 30-53) claims:
- "the on-disk file size is read back via fs.stat()" — accurate (line 99).
- "On pipeline failure we attempt to unlink the partial file" — accurate
  (line 119).
- "(cycle-2 C2-AGG-3 simplification)" — citation accurate.
- "(cycle-2 C2-AGG-2)" — citation accurate.

Line 96 cites `cycle-3 CYC3-AGG-1` — accurate.

### `src/lib/assignments/scoring.ts`

JSDoc at lines 5-12 claims:
- "For SQL-level scoring (...) prefer `buildIoiLatePenaltyCaseExpr()`" — accurate.

Line 31 cites `cycle-3 CYC3-AGG-6` — accurate.

JSDoc at lines 66-100 (CYC3-AGG-4 rewrite):
- "PRIMARY: Callers MUST pass only hardcoded string literals" — load-bearing.
- "non-exhaustive blocklist of dangerous SQL keywords" — accurate.
- "TRUNCATE, GRANT, REVOKE, MERGE, CALL, LOCK are intentionally NOT blocked" — accurate (none in regex at line 102).
- "negative-path test suite in `tests/unit/assignments/scoring.test.ts`" — accurate (12 negative tests at scoring.test.ts:122+ from cycle-2).

### `src/lib/assignments/recruiting-results.ts`

Module JSDoc (lines 3-15) claims:
- "Pure helpers for the recruit-results page (H-4) scoring math" — accurate.
- "(cycle-3 CYC3-AGG-2)" — citation accurate.
- "Default per-problem points (when `assignmentProblems.points` is null) is 100" — accurate (line 61).

Function JSDoc (lines 36-52) claims:
- The 3×25-point worked example — accurate.
- "leaderboard / stats / assignment-status SQL views use `buildIoiLatePenaltyCaseExpr()`" — accurate.

### `tests/unit/db/pre-restore-snapshot.test.ts`

Test header (lines 6-10) claims:
- "CYC3-AGG-3 / C1-AGG-24" — accurate.
- "Mocking streamDatabaseExport with a tiny Web ReadableStream" — accurate.

### `tests/unit/data-retention-maintenance.test.ts`

Test header at line 113 claims:
- "(CYC3-AGG-5)" — accurate.
- "Cycle-1 introduced Promise.allSettled" — accurate.
- "cycle-2 documented the failure-isolation contract in JSDoc" — accurate
  (`data-retention-maintenance.ts:94-105`).

### `tests/unit/assignments/recruiting-results.test.ts`

Test header (lines 8-11) claims:
- "CYC3-AGG-2" — accurate.
- "extracted from the recruit-results server-component" — accurate.

### `plans/done/2026-05-04-rpf-cycle-3-review-remediation.md`

Plan body claims:
- 6 commits land for TASKS 1-6 — accurate (commits cited at lines 301-306).
- "`npm run test:unit` — 307 files / **2256 tests passed** (+15 new)" —
  unverified at HEAD (gates need re-run for cycle-4 evidence).
- "Plan archived to `plans/done/` after close-out" — accurate (file is in
  `plans/done/`).

## NEW findings this cycle

### DS4-1: [LOW] `SECURITY.md` could mention the pre-restore snapshot test pin

- **File:** `SECURITY.md`
- **Description:** Cycle-2 added a `SECURITY.md:50-73` section about the
  pre-restore snapshot artifact. Cycle-3 added the unit test that pins
  the file mode + retention contract. `SECURITY.md` does not link to
  `tests/unit/db/pre-restore-snapshot.test.ts` for verifiers who want
  to confirm the on-disk contract.
- **Confidence:** LOW (doc completeness)
- **Fix:** Append a single sentence to the SECURITY.md section: "The
  on-disk contract (mode 0o600, retention RETAIN_LAST_N=5, unlink-on-error)
  is pinned by `tests/unit/db/pre-restore-snapshot.test.ts`." Optional
  polish.

### DS4-2: [LOW] No JSDoc on `RecruitProblemRow`/`RecruitBestSubmission` interface members

- **File:** `src/lib/assignments/recruiting-results.ts:17-24`
- **Description:** `RecruitProblemRow` has only types; no field-level
  JSDoc. `RecruitBestSubmission` ditto. `RecruitResultsTotals` has good
  field-level JSDoc. The asymmetry is minor but the input interfaces
  could be clearer about what each field represents.
- **Confidence:** LOW
- **Fix:** Add a one-line `/** ... */` comment per field. Optional polish.

### DS4-3: [LOW] CYC3-AGG-1 source comment cites the finding ID but no file path to the test

- **File:** `src/lib/db/pre-restore-snapshot.ts:96`
- **Description:** The comment "(cycle-3 CYC3-AGG-1)" is provenance; a
  reader who wants to find the test for the contract must search by ID
  or grep. Compare with `scoring.ts:79-83` which explicitly names the
  test file.
- **Confidence:** LOW (consistency)
- **Fix:** Append "pinned by `tests/unit/db/pre-restore-snapshot.test.ts`"
  to the comment. Optional polish.

## Carry-forward doc items

| ID | File | Status | Exit criterion |
|----|------|--------|----------------|
| C1-AGG-13 | AGENTS.md TOC | DEFERRED | Writer cycle |
| C1-AGG-22 | aggregate ID index | DEFERRED | Doc-tooling cycle |

## Summary

| ID | Severity | Confidence | File | Action |
|----|----------|------------|------|--------|
| DS4-1 | LOW | LOW | `SECURITY.md` | Append test-link sentence (polish) |
| DS4-2 | LOW | LOW | `recruiting-results.ts` | Field-level JSDoc (polish) |
| DS4-3 | LOW | LOW | `pre-restore-snapshot.ts` | Comment polish |

No HIGH/MEDIUM doc findings. All cycle-3 commit citations are accurate;
the test files cite their findings; the source comments cite the findings.
The doc trail is solid.
