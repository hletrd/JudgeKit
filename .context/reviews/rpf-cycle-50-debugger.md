# Cycle 50 — Debugger

**Date:** 2026-04-23
**Base commit:** 6463cdda
**Reviewer:** debugger

## Findings

No new latent bugs found this cycle.

### DBG-Sweep: ICPC Tie-Breaker Fix Verified

The ICPC leaderboard tie-breaker fix from cycle 49 (commit 39dcd495) was verified:

- Line 357-358 of `contest-scoring.ts`: `return a.userId.localeCompare(b.userId);` is present as the final tie-breaker
- Matches the IOI pattern on line 361: `|| a.userId.localeCompare(b.userId)`
- Rank assignment logic (lines 366-379) correctly checks ties for both ICPC and IOI models
- The ICPC tie condition (line 372) checks `totalScore` and `totalPenalty` but not last AC time — this is correct because the sort already ordered by last AC time, and tied entries with the same totalScore and totalPenalty but different last AC times will have different ranks (which is correct ICPC behavior)

### Carry-Over Confirmations

All prior carry-over items remain valid and documented in `_aggregate.md`.

## Sweep Notes

No new failure modes or latent bugs identified.
