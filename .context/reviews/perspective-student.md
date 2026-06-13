# perspective-student — RPF Cycle 10 (2026-06-13)

Seat: a student taking assignments/exams.

## Assessment
**No new actionable findings.** The flows central to a student's experience are sound at this HEAD:
- Mid-exam disconnect/timeout: `startExamSession` is idempotent (re-entry returns the same session, never a panic-inducing false "closed" — RPF cycle-4 AGG4-4 intact); the personal deadline is computed once and respected by scoring.
- Anxiety-inducing failure modes: the `insert-then-vanish` anomaly returns a retryable 500, not a terminal "your exam is closed."
- Fairness: a frozen leaderboard now auto-unfreezes at the deadline (no permanent freeze), and the student's own live rank is computed consistently with the full board (IOI per-problem-best, override-overlaid).
- Late penalty keys on the per-session `personal_deadline`, so staff-granted extensions are honored fairly.

## Carried (need a live browser; exit criterion did not fire)
- ST5-5: the countdown timer trusts the client clock between server syncs — a server-time sync indicator would reduce anxiety about a drifting local clock. LOW/Medium, carry.
