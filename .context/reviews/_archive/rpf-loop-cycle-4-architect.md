# Architect — RPF Loop Cycle 4 (2026-05-03)

**Lens:** layering, coupling, module boundaries, growth trajectories.

## Module-boundary review

### Recruit-results helper extraction (CYC3-AGG-2)

The new module `src/lib/assignments/recruiting-results.ts` lives in
`src/lib/assignments/` alongside `scoring.ts`. This is the right home:
- Both files are about assignment-points math.
- The helper is a thin wrapper around `mapSubmissionPercentageToAssignmentPoints`.
- A future ML/recruiting-specific scoring strategy could grow inside this
  module without polluting the more general `scoring.ts`.

The page no longer imports `scoring.ts` directly; the import-graph layer
now reads:
- `page.tsx` → `recruiting-results.ts` → `scoring.ts`

This is a strict improvement over the pre-cycle-3 layering where the page
imported `scoring.ts` AND owned the per-problem reduction logic.

### `pre-restore-snapshot.ts` location (carry-forward C1-AGG-15)

The file still lives in `src/lib/db/`. Architectural critique:
- The function is operator-tooling (called from a destructive restore
  path) rather than ordinary DB I/O.
- A more accurate home would be `src/lib/ops/` or `src/lib/maintenance/`.
- Carry-forward C1-AGG-15 already tracks this; not actionable this cycle.

### `data-retention-maintenance.ts` (no change this cycle)

Layering remains: `data-retention-maintenance.ts` orchestrates 5 prune
helpers, each calling `batchedDelete` against a different table. The new
test pins the orchestration contract (`Promise.allSettled` semantics) but
doesn't change layering.

## Coupling analysis

### Page → Helper coupling

The page passes `bestByProblem: Map<string, (typeof submissionRows)[number]>`
to the helper which expects `ReadonlyMap<string, RecruitBestSubmission>`.
TypeScript's structural width-subtyping accepts this. Coupling is loose
because:
- The helper reads only `score`.
- The page can change other fields without updating the helper.

But: this is implicit. If the helper grows to read another field, the
page-side widening could mask the requirement. CR4-1 / CRIT4-2 already
flag this.

### Test → Source coupling

The new tests use `vi.mock("@/lib/db/export", ...)`,
`vi.mock("@/lib/db", ...)`, and `vi.mock("drizzle-orm", ...)`. The
drizzle-orm stub returns plain `{_lt, _and, _or, ...}` objects. This means:
- The tests are coupled to drizzle-orm's API surface only (function names),
  not its internals.
- A drizzle-orm major-version bump that renames `lt` → `lessThan` would
  break the source AND the test together. Acceptable.
- A breaking change inside drizzle-orm (e.g., `lt` returns a Symbol instead
  of an object) would break the test before the source if the source's
  call shape didn't match the test stub. Acceptable.

## Growth trajectories

### File sizes touched this cycle

| File | Pre-cycle-3 lines | Post-cycle-3 lines | Trajectory |
|------|-------------------|---------------------|------------|
| `pre-restore-snapshot.ts` | ~145 | ~160 | +15 (slow growth) |
| `scoring.ts` | ~155 | ~166 | +11 (slow growth, doc-heavy) |
| `recruiting-results.ts` | 0 | 71 (NEW) | new |
| `recruit/[token]/results/page.tsx` | ~290 | ~270 | -20 (extraction) |
| `data-retention-maintenance.ts` | unchanged | unchanged | flat |

No file is approaching an extraction threshold. `compiler/execute.ts`
(carry-forward C3-AGG-9 / C1-AGG-17) remains at 855 lines; threshold
trigger is >1000 lines or judge-runtime feature touch.

## Architectural risk surface

### A1: `validateSqlColumnName` blocklist as primary defence (carry-forward CYC3-AGG-7)

CYC3-AGG-4 JSDoc rewrite mitigates this risk by making the caller-contract
PRIMARY and explicitly disclosing the blocklist's non-exhaustiveness.
A future maintainer adding a non-literal caller is now on notice. Risk
remains LOW; defence-in-depth is acceptable for the current threat model.

### A2: Map structural-typing widening (CR4-1)

The page's wider Map structurally fits the helper's narrower input. If
the helper grows to read a new field, the page's wider Map silently
provides it OR silently provides `undefined`. This is the price of
TypeScript structural typing. Mitigation: keep `RecruitBestSubmission`
small and narrow; the test pin would catch a `score`-related drift.
Risk LOW.

### A3: Test mock-import order (general)

The cycle-3 close-out tests use `vi.hoisted(() => ({mocks}))` and
`vi.mock(...)` factory functions. The pattern is correct (mocks
hoisted to module-eval time so dynamic `import()` calls see the stub).
Documentation gap: no comment in the test files explaining why
`vi.hoisted` is used. A future maintainer might "simplify" by inlining
the mock and break the order. Risk LOW; CR4-3 partially addresses.

## NEW findings this cycle

### ARCH4-1: [LOW] `pruneSensitiveOperationalData` legal-hold short-circuit not exercised by the test

- **File:** `src/lib/data-retention-maintenance.ts:107-110`
- **Description:** `if (DATA_RETENTION_LEGAL_HOLD)` returns early without
  pruning. The new failure-isolation test does not cover this branch.
  Operationally, the legal-hold flag is the operator's escape hatch for
  litigation holds; a regression that drops it is high-impact.
- **Confidence:** LOW (test gap, no behaviour bug)
- **Failure scenario:** Refactor accidentally moves the legal-hold check
  inside the try-block where a thrown DB error before reaching the check
  still emits warn logs. Today's behaviour: legal-hold check is the first
  statement, before any DB call.
- **Fix:** Add a unit test that imports the function with
  `DATA_RETENTION_LEGAL_HOLD = true` (env override or module-level mock)
  and asserts `db.execute` is never called. Optional polish.

### ARCH4-2: [LOW] No layered "ops" module hierarchy yet

- **File:** structural — `src/lib/db/pre-restore-snapshot.ts` and
  `src/lib/data-retention-maintenance.ts` are both operator-tooling but
  in different parents.
- **Description:** A future `src/lib/ops/` or `src/lib/maintenance/`
  parent module would group operator-tooling files (snapshots, retention
  prunes, audit pruning, etc.). Today they're scattered across `src/lib/db/`
  and `src/lib/`. This is a slow-growth concern.
- **Confidence:** LOW (architectural taste)
- **Fix:** Defer until 3+ ops files exist OR a new ops file is added.
  Carry-forward C1-AGG-15 partially overlaps.

## Carry-forward architectural items (status unchanged)

| ID | File | Status | Exit criterion |
|----|------|--------|----------------|
| ARCH-CARRY-1 | 20 raw API handlers | DEFERRED | API-handler refactor cycle |
| ARCH-CARRY-2 | `realtime-coordination.ts` + SSE route | DEFERRED | SSE perf cycle OR >500 concurrent |
| C1-AGG-15 | `pre-restore-snapshot.ts` location | DEFERRED | Ops-tooling consolidation cycle |
| C3-AGG-9 / C1-AGG-17 | `compiler/execute.ts` size | DEFERRED | >1000 lines OR judge-runtime feature |

## Summary

| ID | Severity | Confidence | File | Action |
|----|----------|------------|------|--------|
| ARCH4-1 | LOW | LOW | `data-retention-maintenance.ts` | Add legal-hold test |
| ARCH4-2 | LOW | LOW | structural | Defer (taste) |

No HIGH/MEDIUM architectural findings. The cycle-3 fixes are layering-positive
(page → helper → scoring) and do not regress any existing module boundaries.
