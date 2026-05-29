# Cycle 7 — architect (design / coupling / layering)

**Finding N7-C7 (architectural framing):** the project has TWO scoring-aggregation engines over the same `assignments`/`submissions` data:
1. `getAssignmentStudentStatus` (`src/lib/assignments/submissions.ts`) — gradebook/student-status; applies `score_overrides`.
2. `computeContestRanking` (`src/lib/assignments/contest-scoring.ts`) + `computeSingleUserLiveRank` (`leaderboard.ts`) — leaderboard/export/analytics/audit/replay; does NOT apply `score_overrides`.

These engines duplicate the IOI late-penalty expression (`buildIoiLatePenaltyCaseExpr`) and the ROUND-2 AC detection, but have **diverged on override handling**. This is a Single-Source-of-Truth violation for "effective per-problem score": the same business concept ("a student's score on a problem in an assignment") is computed two ways with different results. **Severity: MEDIUM** (correctness/consistency). The duplication is the root architectural risk — any rule applied to one engine must be applied to the other, and override handling slipped.

**Recommendation (minimal, this cycle):** overlay `score_overrides` in `computeContestRanking` (and the single-user live rank), mirroring `getAssignmentStudentStatus` exactly, so both engines agree. A larger refactor unifying the two engines is out of scope (would be net-new scope, not a review finding) — note as a future consideration only, NOT a deferred finding.

## Other observations (no net-new)
- Worker lifecycle state machine now complete after N6-C6 (`online → stale → online|offline`); the heartbeat sweep is the sole autonomous actor and now reaches the terminal state. Sound.
- The "poll" route name is a documented historical misnomer (it receives result POSTs); the directory cannot be renamed without a coordinated worker redeploy (`poll/route.ts:1-5`). Acceptable, documented coupling.

Carried deferred ARCH-1 (generic 500 in `createApiHandler`), ARCH-2 (dual token system) — preconditions unchanged; re-defer.
