# Cycle 8 — critic lens

**HEAD:** db1a28d0.

## Multi-perspective critique
- **Is N8-C8-LIVERANK real or invented churn?** Real. It is confirmed by three independent signals: (1) direct query reading (SUM/GROUP BY user_id vs MAX/GROUP BY user_id,problem_id), (2) the self-incriminating in-code comment at `leaderboard.ts:202-203`, (3) a worked numeric example where ranks invert. Not manufactured.
- **Severity calibration:** MEDIUM, not HIGH. The defect affects only the *indicative* live-rank badge shown to a student during the freeze window; the authoritative, override-aware standings (`computeContestRanking`) are correct, and the bug has no security/data-loss dimension. But it is user-visible and contradicts the function's own docstring, so it is NOT a LOW informational nit either, and it is NOT deferrable (correctness invariant).
- **Scope discipline:** The fix must stay narrow — fix the IOI aggregation shape + add a guard test. Do NOT bundle the still-deferred N7-C7 override overlay onto the live rank (separate product decision per the existing comment), and do NOT over-abstract into a shared SQL builder (only two callers).
- **Convergence honesty:** This is one genuine net-new MEDIUM. It does NOT represent low-value churn; it was found by following the orchestrator's explicit directive to broaden into ranking-subsystem internals. After this, the open backlog is again only carried LOW/MEDIUM deferred items.

## No additional NEW findings.
