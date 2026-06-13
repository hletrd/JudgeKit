# debugger — RPF Cycle 10 (2026-06-13)

**HEAD:** 03125b44 (clean tree).

## Method
Hunted for latent logic bugs / edge cases in the recently-changed surfaces and adjacent code: exam-session start (race/idempotency), leaderboard freeze boundary, accepted-solutions count vs. page filtering, and the tiebreak fixes.

## Findings
**No new actionable bugs.**
- `startExamSession` is correctly idempotent: existence check + `onConflictDoNothing` + authoritative re-fetch inside a transaction; the `insert-then-vanish` anomaly throws `examSessionUnavailable` (retryable 500) instead of the panic-inducing `assignmentClosed` (RPF cycle-4 AGG4-4, intact).
- `extendExamSession` composes concurrent extensions in SQL (`personal_deadline + make_interval`), never clobbers, validates `extendMinutes >= 1`.
- Leaderboard freeze has a correct upper bound (auto-unfreeze at lateDeadline/deadline) so a frozen board does not stick forever for students.
- Live-rank IOI/ICPC queries handle the empty-target (no submissions) case explicitly (return null) rather than misreporting rank 1.
- The 3 cycle-9 tiebreak fixes are correct in every branch; the contract test pins them.

## Pre-existing (not a regression, not introduced this cycle)
- `accepted-solutions` page-size shrinkage from post-pagination `shareAcceptedSolutions` filtering — a long-standing cosmetic count quirk, deterministic order preserved. Noted, not actionable as a new finding.

## Carried
AGG8-2 (gap-scan order) and P6-1 (similarity pre-loop) — exit criteria did not fire (neither block edited). Carry.
