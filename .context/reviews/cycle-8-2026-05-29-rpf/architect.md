# Cycle 8 — architect lens

**HEAD:** db1a28d0.

## Design observation behind N8-C8-LIVERANK
The root design risk is **divergent reimplementation of the same scoring rule in two queries**. `scoring.ts` correctly centralizes the per-row penalty CASE (`buildIoiLatePenaltyCaseExpr`) as a single source of truth, but the *aggregation shape around it* (per-problem MAX then per-user SUM) is reimplemented separately in `contest-scoring.ts` (correct) and `leaderboard.ts` (wrong). The shared fragment gave a false sense of consistency: the docstring and tests assert "same logic" because the shared fragment matches, while the aggregation diverges.

Recommended scoping for the fix: make the IOI live-rank query's aggregation structurally mirror the full board (per-problem CTE → SUM), and add a structural guard test pinning the per-problem-best invariant. A full extraction of the aggregation into a shared SQL builder is NOT warranted now (only two callers; over-abstraction risk) — defer any such consolidation.

## No NEW architectural findings
ARCH-CARRY-1 (raw API handlers) and ARCH-CARRY-2 (SSE eviction) preconditions unchanged → re-defer.
