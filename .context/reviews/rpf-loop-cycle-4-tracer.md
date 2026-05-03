# Tracer — RPF Loop Cycle 4 (2026-05-03)

**Method:** trace each cycle-3 close-out commit's logical reach across the
codebase.

## Trace 1: CYC3-AGG-1 stat-failure log split

Source: `src/lib/db/pre-restore-snapshot.ts:99-110`

Callers of `takePreRestoreSnapshot`:
- `src/lib/db/import.ts` (operator-initiated restore path)

Reach analysis:
- The split branches on `stStat === null`. The warn line carries
  `{path, actorId}` — sufficient for an operator to identify the file
  even without knowing the size.
- The info line carries `{path, sizeBytes, actorId}` — same shape as
  before the split. Log consumers (likely structured grep) see the same
  schema.
- Downstream pruning is unchanged. The fire-and-forget `pruneOldSnapshots`
  call still happens regardless of which log branch fired. Correct.

## Trace 2: CYC3-AGG-6 NaN guard

Source: `src/lib/assignments/scoring.ts:32-34`

Callers of `mapSubmissionPercentageToAssignmentPoints`:
- `src/lib/assignments/recruiting-results.ts:65` (NEW this cycle, calls
  the helper which calls scoring)
- `src/components/student/...` (live-rank component)
- Other contexts where SQL-level scoring is unavailable

Reach analysis:
- The guard returns 0 for NaN/Inf. All call sites today pass numbers from
  DB rows or null-checked submission rows, so the guard is dead code on
  the warm path. But it's load-bearing for any future caller that uses
  parseFloat or arithmetic that might produce NaN.
- The recruit-results helper's call signature `score: number | null` is
  a tighter type than `number`, so a NaN can only enter via TypeScript
  widening (e.g., a typed-as-number column that the DB sometimes returns
  null for). The guard is the last line of defence.

## Trace 3: CYC3-AGG-2 recruit-results extract

Source: `src/lib/assignments/recruiting-results.ts:53-71`

Callers:
- `src/app/(auth)/recruit/[token]/results/page.tsx:196-197` (server component)

Reach analysis:
- The page reduction loop (was at lines 194-206) is now a single
  `computeRecruitResultsTotals(...)` call. The page no longer imports
  `mapSubmissionPercentageToAssignmentPoints` directly; that import
  moved into the helper file.
- The page still does the `bestByProblem` reduction inline because that
  is a separate concern (it picks the best submission per problem; the
  helper consumes the result).
- The helper is pure (no side effects, no I/O). It returns three values
  used in the page render.

## Trace 4: CYC3-AGG-4 JSDoc rewrite (no runtime change)

No runtime reach. The regex `SQL_COLUMN_NAME_RE` and `SQL_COLUMN_DANGEROUS_RE`
are unchanged at lines 101-102. The JSDoc now leads with the caller-contract.

## Trace 5: CYC3-AGG-3 / CYC3-AGG-5 test additions (no runtime reach)

Tests are isolated in `tests/unit/`. No production runtime reach.

## NEW findings this cycle

### TR4-1: [LOW] `recruit/[token]/results/page.tsx:174-186` reduction is conceptually pair-able with the helper

- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:174-186`
- **Description:** The `bestByProblem` reduction (pick best score per
  problem, ties resolve to earliest) is logically paired with the helper.
  Both could live in `recruiting-results.ts` as a two-stage pipeline:
  `pickBestPerProblem(submissions) → Map → computeRecruitResultsTotals(map)`.
  Today the page handles stage 1 inline, helper handles stage 2.
- **Confidence:** LOW (architectural taste; not a defect)
- **Failure scenario:** Future change swaps tie-break order (e.g., latest
  instead of earliest) by editing the page reduction but missing the helper
  test. The helper test would still pass because it accepts an arbitrary
  Map.
- **Fix:** Optional — extract `pickBestPerProblem(submissions)` into the
  helper file with its own test. Defer until next recruit-results touch.

### TR4-2: [LOW] CYC3-AGG-1 split's warn message string changed

- **File:** `src/lib/db/pre-restore-snapshot.ts:103`
- **Description:** Pre-cycle-3, the success log line was
  `"[restore] pre-restore snapshot written"` always. Post-cycle-3, the
  same string is preserved on the success path, and a NEW warn line
  `"[restore] pre-restore snapshot written but size unavailable (stat failed)"`
  is emitted on the stat-failure path. Operator log search alerts (e.g.,
  Loki/Grafana) keyed on the existing string still match the success
  path; the new warn line needs a separate alert if operators want to
  catch stat-failure events.
- **Confidence:** LOW (operational signal, not correctness)
- **Fix:** Document in the operator runbook (or `SECURITY.md`) that two
  log lines now exist. Defer; no operator-visible regression.

## Carry-forward trace observations (status unchanged)

- `validateSqlColumnName` reach: still only `buildIoiLatePenaltyCaseExpr`
  (4 column-name parameters, all hardcoded literals). No new callers.
- `pre-restore-snapshot.takePreRestoreSnapshot` reach: still only
  `src/lib/db/import.ts` operator restore path. No new callers.
- `mapSubmissionPercentageToAssignmentPoints` reach: now also called via
  the helper. No new direct callers.

## Summary

| ID | Severity | File | Action |
|----|----------|------|--------|
| TR4-1 | LOW | `recruit/[token]/results/page.tsx` | Defer (architectural taste) |
| TR4-2 | LOW | `pre-restore-snapshot.ts` | Document in runbook |

No HIGH/MEDIUM trace findings. The cycle-3 fixes have local, well-scoped
reach. No surprise call sites surfaced.
