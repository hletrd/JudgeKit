# perf-reviewer — RPF Cycle 10 (2026-06-13)

**HEAD:** 03125b44 (clean tree).

## Method
Reviewed the hot paths: similarity engine (O(n²) pairwise), leaderboard/contest-scoring SQL, export streaming, and the offset-paged listings (offset paging degrades at deep pages but all are bounded by sane caps).

## Findings
**No new actionable performance findings.**
- `runSimilarityCheckTS` time-slices the O(n²) comparison phase via monotonic `performance.now()` and a `YIELD_INTERVAL_MS=8` yield, and honors the abort signal (`code-similarity.ts:285-304`). Input is hard-capped at `MAX_SUBMISSIONS_FOR_SIMILARITY=500` (rejected upfront, line 379) and `MAX_STRING_LITERAL_LENGTH=10_000`. The Rust sidecar is the default engine; the TS path is a staff-triggered fallback.
- Leaderboard/live-rank SQL uses window functions + per-problem-best CTEs (no N+1); freeze/unfreeze is a single metadata read + one ranking query.
- Export streams in 1000-row chunks under a REPEATABLE READ snapshot with backpressure (`waitForReadableStreamDemand`).
- Offset paging on listings is bounded (limit ≤200/≤500); no unbounded scans on user-facing paths.

## Carried (RISK, exit criterion did NOT fire)
- P6-1: the normalize/n-gram PRE-loop (`code-similarity.ts:267-274`) still does not yield/abort, but it is bounded by the 500-row + 10k-literal caps and the function was NOT edited this cycle (last edit 150b74ed). Exit criterion (edit to `runSimilarityCheckTS`) did not fire. Carry at LOW/Medium-RISK, severity preserved.
