# Perf Reviewer — RPF Loop Cycle 4 (2026-05-03)

**Scope:** Cycle-3 close-out commits, `dafc0b24..7a195b11`.

## Hot paths analysed

### Recruit-results page (candidate-facing)
- `Promise.all` for the two SELECTs landed cycle 2 (C2-AGG-4); helper extract
  this cycle does not change query count or latency.
- The helper `computeRecruitResultsTotals` runs O(N) over `assignmentProblemRows`
  with O(1) Map lookup per problem. No regression vs the inline loop.
- Two map allocations (`adjustedByProblem`, `bestByProblem`) for an assignment
  that has up to ~20-30 problems is negligible.

### `pre-restore-snapshot.ts` write path
- The CYC3-AGG-1 split adds one extra `if (stStat === null)` branch on the
  warm path. Negligible.
- The pipeline is unchanged: `Readable.fromWeb(stream) -> createWriteStream(0o600)`.
  Memory-bounded. No regression.

### `scoring.ts` NaN guard
- `Number.isFinite` short-circuit at the top of `mapSubmissionPercentageToAssignmentPoints`.
  Single number-class check per call. Cost: negligible.

## Test execution cost

- 5 new unit-test files: `recruiting-results.test.ts` (8 cases),
  `pre-restore-snapshot.test.ts` (5 cases), retention isolation case,
  scoring NaN test.
- Snapshot retention test sleeps 7×5ms = 35ms — acceptable. Total +15
  tests pinned at the cycle-3 close-out (gate run shows 2256 unit tests,
  +15 vs prior cycle).

## NEW findings this cycle

### PERF4-1: [LOW] Snapshot retention test inserts a `setTimeout(r, 5)` per iteration

- **File:** `tests/unit/db/pre-restore-snapshot.test.ts:124`
- **Description:** The retention test waits 5ms × 7 iterations = 35ms total
  to ensure distinct mtimes. Cumulatively, this is fine for a single test
  suite, but is a cost trap if the same pattern is copied into many tests.
- **Confidence:** LOW
- **Fix:** Future expansion of this test should batch creation and verify
  prune at the end rather than serialise. Not actionable this cycle.

### PERF4-2: [LOW] `recruiting-results.ts` does not pre-allocate Map capacity

- **File:** `src/lib/assignments/recruiting-results.ts:57`
- **Description:** `new Map<string, number>()` does not pre-size, so it
  rehashes once around 32 entries. For typical assignments with 20-30
  problems, this is one extra rehash. JS engines do not expose an API to
  pre-size, so this is a non-actionable observation.
- **Confidence:** N/A
- **Fix:** None — JS Maps lack pre-sizing.

## Carry-forward perf items (status unchanged)

| ID | File | Status | Exit criterion |
|----|------|--------|----------------|
| AGG-2 | `in-memory-rate-limit.ts` Date.now + sort | DEFERRED | Rate-limit-time perf cycle |
| ARCH-CARRY-2 | `realtime-coordination.ts` + SSE route | DEFERRED | SSE perf cycle OR >500 concurrent |
| PERF-3 | Anti-cheat heartbeat query | DEFERRED | p99 > 800ms OR >50 contests |
| C2-AGG-6 | `practice/page.tsx:417` | DEFERRED | p99 > 1.5s OR >5k matching problems |

## Recommendations summary

| ID | Severity | Confidence | File | Action |
|----|----------|------------|------|--------|
| PERF4-1 | LOW | LOW | `pre-restore-snapshot.test.ts` | Document; not actionable |
| PERF4-2 | LOW | N/A | `recruiting-results.ts` | None (engine limitation) |

No HIGH/MEDIUM perf findings. The cycle-3 fixes are perf-neutral or
positive; the new tests add ~35ms total runtime.
