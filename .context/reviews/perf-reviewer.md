# Perf Reviewer — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72.

## No new performance regressions found.
- The cycle-7 listing-order change adds a second `desc(id)` key to existing
  `ORDER BY createdAt` clauses. On Postgres these are covered by, or cheaply
  satisfied alongside, the existing `created_at` indexes; `id` is the PK so the
  composite sort is well-supported. No added scan cost. ✅
- The dashboard poll-merge id-union is O(page) via a `Set` of fresh-page ids
  (anti-cheat-dashboard.tsx:141-143); loadMore dedupe is O(loaded) via a `Set`.
  Both are bounded by PAGE_SIZE=100 and the loaded-row count — no quadratic
  blowup. ✅
- CR8-1's fix is a value substitution with zero perf delta.

## Carried deferral (perf RISK, exit criterion NOT fired) — P6-1
**File:** `src/lib/assignments/code-similarity.ts:266-275` (`runSimilarityCheckTS`).
The normalize + n-gram *grouping* phase iterates all rows and builds n-gram sets
before the time-sliced pair loop begins; it neither yields nor checks the abort
signal during grouping. Bounded by the 500-row + 10k-literal caps; the Rust
sidecar is the default engine; the TS fallback is staff-triggered and rare.
`runSimilarityCheckTS` was NOT edited this cycle (recent similarity commits
touched evidence-language and skip-reason, not this phase) → **exit criterion
did not fire; carried at LOW/Medium (RISK)**. Exit: any edit to
`runSimilarityCheckTS`, or an incident implicating app-server event-loop stalls
during a fallback run.
