# Debugger — RPF Cycle 9 (2026-06-13)

**HEAD:** da6179f3. Baseline gates green (tsc 0 / eslint 0 / unit 2663 PASS).

## D9-1 — same-millisecond `created_at` ties make snapshot paging nondeterministic (MEDIUM, High)
**File:** `code-snapshots/[userId]/route.ts:54`. Concrete reproduction:
1. A candidate types continuously; the editor autosaves snapshots A, B, C all
   with `created_at = 2026-06-13T10:00:00.123Z` (same ms — plausible under fast
   typing + autosave debounce; the insert uses `new Date()` default, no explicit
   monotonic sequence).
2. Instructor opens the snapshot timeline with `pageSize=50`. Page 1 query
   `ORDER BY created_at ASC LIMIT 50 OFFSET 0` returns …A,B at the tail.
3. Page 2 `… LIMIT 50 OFFSET 50` re-evaluates the sort; Postgres may now place C
   before B, so B is at offset 49 (page 1 tail) AND offset 50 (page 2 head) →
   **B shown twice, and the row that should have been at the boundary is
   dropped.** On an anti-cheat evidence surface, a missing/duplicated snapshot
   undermines the integrity of a misconduct review.
**Root cause:** non-unique sort key + offset paging (the same root cause cycle-7
fixed elsewhere and that the deferred AGG8-2 register flagged for heartbeats).
**Fix:** add `asc(codeSnapshots.id)` tiebreak. Same fix shape resolves the
recruiting-invitation list (`recruiting-invitations.ts:272`) and the
accepted-solutions list (`accepted-solutions/route.ts:54-59`) — see code-reviewer.

## Deferred-register exit-criteria check (this cycle)
- **AGG8-2** (`anti-cheat/route.ts:316-325`, heartbeat gap scan `limit(5000)`
  ordered `desc(createdAt)` only): block UNCHANGED this cycle → exit criterion
  ("next edit to the gap scan") NOT fired. Note: CR9-1 is a *different* route
  (code-snapshots, offset-paged, high-collision) and is NOT a reason to reopen
  AGG8-2; the gap scan stays deferred under its own terms.
- **P6-1** (`code-similarity.ts:266-275`): `runSimilarityCheckTS` UNCHANGED → carry.

No other reproducible defect surfaced from the data-flow / state-consistency
pass. Token-lifecycle invariant holds across all 4 insert sites.
