# RPF Cycle 8 — Aggregate Review

**Date:** 2026-05-29
**HEAD reviewed:** db1a28d0 (main)
**Cycle:** 8/100 (orchestrator-numbered)
**Per-agent reviews:** `.context/reviews/cycle-8-2026-05-29-rpf/{code-reviewer,perf-reviewer,security-reviewer,verifier,test-engineer,debugger,tracer,architect,critic,document-specialist,designer}.md` (11 lenses)
**Prior aggregates preserved:** `rpf-cycle-7-aggregate.md`, `_aggregate-cycle-6-2026-05-29.md`, etc.
**Baseline (re-run this cycle):** lint 0 errors/0 warnings, `tsc --noEmit` 0, `npm run test:unit` 2470 tests / 321 files PASS, `npm run lint:bash` 0. (build re-verified during PROMPT 3.)

---

## Scope
Per the orchestrator's broadening directive, this cycle drilled into the **contest ranking subsystem internals** (the flagged N7-C7-ICPC/LIVERANK area): `src/lib/assignments/leaderboard.ts` (`computeSingleUserLiveRank`), `contest-scoring.ts` (`computeContestRanking`), `scoring.ts` (`buildIoiLatePenaltyCaseExpr`), the leaderboard route, and the override route. Cross-checked IOI vs ICPC and full-board vs single-user-live-rank scoring symmetry.

---

## NEW deduplicated findings this cycle

**Severity tally (NEW):** 0 HIGH, 1 MEDIUM, 0 LOW-actionable.

### N8-C8-LIVERANK — IOI single-user live rank SUMs adjusted score over ALL submission rows instead of per-problem best — MEDIUM · HIGH confidence · CONFIRMED · NOT DEFERRABLE
**Cross-agent agreement: 9 of 11 lenses** (code-reviewer, verifier, debugger, tracer, architect, critic, test-engineer, document-specialist, designer; perf-reviewer concurs the fix is cost-neutral; security-reviewer confirms the fix is injection-neutral). Highest-signal finding of the cycle.

- **File:** `src/lib/assignments/leaderboard.ts:210-223` (IOI `user_scores` CTE).
- **Problem:** `ROUND(SUM(<buildIoiLatePenaltyCaseExpr per-row>), 2) AS total_score ... GROUP BY s.user_id`. The shared CASE fragment is per-row; grouping only by user and SUMming adds up *every* terminal submission row across all problems and resubmissions. The authoritative full board (`contest-scoring.ts:233-235`) instead takes `MAX(<same expr>)` per `(user_id, problem_id)` (per-problem best) and sums those in JS (`contest-scoring.ts:433`).
- **Failure scenario:** Student submits problem A as 40/70/100 and B as 50/80. Full board total = 180; live-rank total = 340. The inflation factor varies per user (resubmission count) so it does NOT cancel in `WHERE us.total_score > t.total_score`. A heavy-resubmitter is ranked falsely high; symmetrically a peer's over-count can depress the student's own rank. The student sees a misleading "live" rank badge during the freeze window. The function docstring (line 197) and the structural tests both claim "same scoring logic as contest-scoring.ts" — false for the IOI aggregation shape. The in-code comment at lines 202-203 independently corroborates the SUM-over-rows shape (it framed it only as a blocker for the deferred override overlay).
- **Why net-new:** Prior cycles tracked only the *score_overrides overlay* gap (N7-C7 / N7-C7-ICPC). This SUM-vs-MAX scoring error is independent and corrupts the IOI live rank even with zero overrides. Found by following the orchestrator's directive to broaden into ranking internals.
- **Fix:** Restructure the IOI `user_scores` CTE to a per-problem-best inner aggregate (`MAX(<expr>)` GROUP BY `s.user_id, s.problem_id`), then a per-user `SUM` of those bests — mirroring the full board exactly. Keep the target/rank comparison unchanged. Correct the docstring (line 197) and the N7-C7 comment (lines 200-207) so they agree. Add a structural guard test to `leaderboard-live-rank-logic.test.ts` pinning the per-problem-best invariant.
- **Scope discipline (architect + critic):** Do NOT bundle the deferred N7-C7 override overlay onto the live rank (separate product decision); do NOT over-abstract into a shared SQL aggregation builder (only two callers).
- **NOT DEFERRABLE:** scoring/correctness invariant; user-visible wrong rank.

### Non-actionable observations (no NEW finding)
- **ICPC live-rank penalty epoch quirk** (`leaderboard.ts:168`): `EXTRACT(EPOCH FROM first_ac_at)::bigint / 60` is minutes-since-Unix-epoch, not minutes-since-contest-start. The constant offset is identical for all users, cancels in the rank comparison, and the function returns only the rank (never the absolute penalty). ICPC rank is correct. Pre-existing quirk, NOT net-new, no action.
- **Override route cache invalidation** (`overrides/route.ts:128,216`): correctly calls `invalidateRankingCache`. No issue.
- **Open cycle-35 plans both fully complete** (all `[x]`) → archive (PROMPT 2).

---

## Re-assessed carried DEFERRED items (severity preserved, NOT downgraded)

| ID | Severity | Re-assessment this cycle | Status |
|---|---|---|---|
| N7-C7 override overlay on live rank | LOW/MED | Per-problem-best CTE (from N8 fix) makes it feasible later, but mapping ICPC overrides still needs a product decision on AC-time source. | RE-DEFER (exit: product decision on override AC-time source) |
| F3 / F4 / N3 (worker trust, triple SELECT, failedTestCaseIndex) | LOW | Trust model unchanged; no DB-profiling signal. | RE-DEFER |
| DOC-C5-2 (register staleClaimTimeoutMs dead field) | LOW | Rust worker only deserializes, never consumes. | RE-DEFER |
| AGG-2 (rate-limit Date.now hot path + overflow sort) | MEDIUM | No perf signal. | RE-DEFER (rate-limit-time perf cycle) |
| ARCH-CARRY-1 (raw API handlers) / ARCH-CARRY-2 (SSE O(n) eviction) | MED/LOW | Preconditions unchanged. | RE-DEFER |
| PERF-3 (anti-cheat dashboard) | MEDIUM | No p99 signal. | RE-DEFER |
| D1 / D2 (JWT clock-skew / per-request DB) | MEDIUM | Fix must live OUTSIDE `src/lib/auth/config.ts` per CLAUDE.md. | RE-DEFER (auth-perf cycle) |
| C1-AGG-3 (client console.error count=25) | LOW | Observability cycle. | RE-DEFER |
| C2-AGG-5 (visibility-aware polling hook) | LOW | 7th-instance trigger still not met. | RE-DEFER |
| C2-AGG-6 (practice filter) | LOW | No p99/scale signal. | RE-DEFER |
| C3-AGG-5 / C3-AGG-6 (deploy-docker.sh size / peer-user) | LOW | Thresholds unmet. | RE-DEFER |
| AGG-7 (encryption plaintext fallback) | LOW | Documented; no incident. | RE-DEFER |
| AGG-9 / rate-limit 3-module duplication | LOW | No consolidation cycle. | RE-DEFER |
| C7-AGG-6 (participant-status time-boundary tests) | LOW | No boundary bug report. | RE-DEFER |
| C7-DS-1 (README /api/v1/time doc) | LOW | README rewrite cycle. | RE-DEFER |
| C7-DB-2-upper-bound (DEPLOY_SSH_RETRY_MAX cap) | LOW | No footgun report. | RE-DEFER |
| DEFER-ENV-GATES (DB-backed integration tests) | LOW | No provisioned CI/host. | RE-DEFER |

No HIGH findings deferred. No security/correctness/data-loss finding deferred without basis (N8-C8-LIVERANK is scheduled, not deferred).

---

## Cross-agent agreement summary
- **N8-C8-LIVERANK** converged across 9 lenses (perf + security concur on fix safety) — strongest signal. Confirmed by code reading, the self-incriminating in-code comment (lines 202-203), and a worked numeric example (debugger/tracer).
- All lenses agree carried deferred items' preconditions are unchanged → re-defer with preserved severity.
- No new HIGH/MEDIUM beyond N8; no Korean-typography or `config.ts` implications; fix is injection- and perf-neutral.

## Convergence status
One net-new actionable MEDIUM finding (N8-C8-LIVERANK), found by the directed broadening into ranking internals. Not a zero-finding cycle. After this fix, the open backlog returns to carried LOW/MEDIUM deferred items only.

## AGENT FAILURES
None. This environment registers no project-specific `*-reviewer` subagents and the running general-purpose agent cannot recursively spawn subagents; the 11 specialist lenses were executed in-process by the cycle agent and written to per-agent files for provenance. All 11 lenses + aggregate completed.
