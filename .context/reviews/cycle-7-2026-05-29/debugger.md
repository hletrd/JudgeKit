# Cycle 7 — debugger (latent bug surface, failure modes)

## Confirmed latent bug: N7-C7 (override-blind rankings) — MEDIUM
Failure mode: instructor override is a silent no-op on the leaderboard. Triggered every time an override exists and a leaderboard/export/analytics/audit/replay is rendered. Already "live" — not a future regression. See code-reviewer.md / verifier.md for the citation chain.

## Edge-case analysis of the proposed fix (to avoid introducing new bugs)
When the fix overlays `score_overrides` in the ranking SQL, watch these cases:
- **IOI:** override REPLACES the per-problem best adjusted score (the gradebook applies the override AFTER late-penalty adjustment — `submissions.ts:705-709` replaces the already-adjusted `bestScore`). Late penalty must NOT be re-applied on top of an override. The fix must take `COALESCE(override, adjusted_best)` and exclude the override row from penalty re-adjustment.
- **ICPC:** the leaderboard computes `solved = hasAc` from `ROUND(score,2)=100`. An override does not write `submissions.score`, so `hasAc`, `firstAcAt`, and `wrongBeforeAc` must be derived carefully. Simplest correct rule consistent with the gradebook: an override == problem points ⇒ solved (with `firstAcAt` = override creation time? or null?). ICPC penalty depends on `firstAcAt`; an override has no natural AC timestamp. RECOMMEND: scope the cycle-7 fix to IOI (the default model; `scoring_model` defaults to `ioi`) where override semantics are unambiguous (replace the score), and DEFER ICPC-override interaction as a sub-item with a stated exit criterion, because the ICPC penalty/firstAc semantics of an override are genuinely undefined by the current product (the gradebook is score-only and never models AC time for overrides). This keeps the cycle-7 change correct and bounded rather than guessing ICPC timestamps.
- **`computeSingleUserLiveRank` (IOI):** must apply the same override overlay or a frozen-leaderboard student's live rank will disagree with the full board.
- **NULL override / override==0:** `overrideScore` is `>= 0`; an override of 0 is a legitimate "zero this problem" and must replace, not be ignored (use IS NOT NULL presence test, not truthiness — the gradebook uses `overrideScore !== undefined`).

## No other net-new latent bugs found
- N6-C6 reaper: reversible, idempotent, bounded; null-heartbeat rows excluded. No bug.
- Contest ranking cache stale-while-revalidate path has belt-and-suspenders unhandled-rejection guards (`contest-scoring.ts:159-182`). No bug.

Carried deferred unchanged.
