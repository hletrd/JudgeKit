# Cycle 8 — debugger lens

**HEAD:** db1a28d0.

## Latent bug surface: N8-C8-LIVERANK (CONFIRMED)
Failure mode: during the freeze window for a frozen IOI contest, a non-instructor student's `liveRank` is computed by `computeSingleUserLiveRank`, whose IOI branch sums adjusted score over all submission rows (`leaderboard.ts:213-222`). A student who resubmits the same problem repeatedly accumulates a falsely high `total_score`, so the `WHERE us.total_score > t.total_score` count of "users above me" is wrong → wrong rank badge. Worst case: the student appears far higher than reality, or (symmetrically) a peer with many resubmissions is over-counted as "above" and the student's own rank is depressed. Either way the displayed live rank is incorrect.

Regression note: this is NOT a recent regression — the SUM shape predates the cycle-7 N7-C7 override fix (which only touched the full board). It surfaced now because cycle 8 broadened review into the live-rank query internals.

Reproduction (logic): two users, one problem worth 100. User X submits twice (60, 100). User Y submits once (100).
- Truth: both solved 100 → tied.
- Live rank for X: SUM = 160 > Y's 100 → X ranked above Y. WRONG.

## No other NEW failure modes
Worker lifecycle stale->offline reaper present (01e8ec07). Ranking cache single-flight + cooldown intact. No NEW.
