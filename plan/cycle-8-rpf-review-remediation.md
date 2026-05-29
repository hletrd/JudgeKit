# Cycle 8 RPF — Review Remediation Plan

**Date:** 2026-05-29
**HEAD at planning:** db1a28d0 (main)
**Source review:** `.context/reviews/cycle-8-2026-05-29-rpf/_aggregate.md` (11 lenses)
**Baseline gates:** lint 0/0, tsc 0, test:unit 2470/321 PASS, lint:bash 0.

---

## Scheduled (implement this cycle)

### Task A — N8-C8-LIVERANK: fix IOI single-user live rank to use per-problem best (MEDIUM, NOT DEFERRABLE)

**File:** `src/lib/assignments/leaderboard.ts:208-244` (IOI branch of `computeSingleUserLiveRank`).

**Problem (confirmed, 9-lens consensus):** The IOI `user_scores` CTE computes
`ROUND(SUM(<buildIoiLatePenaltyCaseExpr per-row>), 2) AS total_score ... GROUP BY s.user_id`,
summing the adjusted score of every terminal submission row across all problems and resubmissions. The authoritative full board (`contest-scoring.ts:233-235`) takes `MAX(<same expr>)` per `(user_id, problem_id)` then sums per-problem bests. The two diverge for any user with >1 terminal submission per problem (the normal contest case), producing a wrong/inflated live-rank badge during the freeze window. The function docstring (line 197) falsely claims "same scoring logic as contest-scoring.ts."

**Implementation:**
1. Replace the single-level `user_scores` CTE with a two-level aggregate:
   - `per_problem` CTE: `SELECT s.user_id, s.problem_id, MAX(<buildIoiLatePenaltyCaseExpr("s.score","COALESCE(ap.points,100)","s.submitted_at","es.personal_deadline")>) AS best` FROM the same `submissions ⨝ assignment_problems ⨝ exam_sessions` set, `WHERE assignment_id = @assignmentId AND status IN (...)`, `GROUP BY s.user_id, s.problem_id`.
   - `user_scores` CTE: `SELECT user_id, ROUND(SUM(COALESCE(best, 0)), 2) AS total_score FROM per_problem GROUP BY user_id`.
2. Keep `target` and the rank comparison (`WHERE ROUND(us.total_score,2) > ROUND(t.total_score,2)`, `1 + COUNT(*)`, `hasSubmissions` guard) unchanged.
3. Keep parameter bindings (`deadline`, `latePenalty`, `examMode`, `assignmentId`, `userId`) unchanged.
4. Correct the docstring (line 196-198) and the N7-C7 comment (lines 200-207) so they describe the new per-problem-best shape; the override *overlay* remains the only deferred N7-C7 sub-item.

**Scope discipline:** Do NOT add the deferred score_overrides overlay to the live rank (separate product decision on ICPC AC-time source). Do NOT extract a shared SQL aggregation builder (only two callers; over-abstraction risk).

**Test (ships with the fix):** Extend `tests/unit/assignments/leaderboard-live-rank-logic.test.ts` IOI section with structural guards:
- Assert a per-problem-best aggregate exists (`MAX(` in the IOI branch + `GROUP BY s.user_id, s.problem_id` / a `per_problem` CTE).
- Assert the outer per-user aggregate sums the per-problem bests (`SUM(` over the per-problem CTE, NOT `SUM(<buildIoiLatePenaltyCaseExpr ...>)` directly with `GROUP BY s.user_id` only).
- Add a guard comment pinning the per-problem-best invariant.

**Exit criteria:** Query restructured; docstring/comment corrected; structural guard tests added and green; all gates (lint, tsc, build, test:unit, lint:bash) green.

**Repo-policy compliance:** GPG-signed (`-S`), conventional commit + gitmoji, no `--no-verify`, `git pull --rebase` before push, fine-grained commits, no Korean text touched, `src/lib/auth/config.ts` not touched.

**Status:** DONE — query restructured to per-problem-best CTE; docstring + N7-C7 comment corrected; 2 structural guard tests added. Gates green: lint 0/0, tsc 0, build OK, test:unit 2472/321 PASS (+2), lint:bash 0.

---

## Deferred findings (recorded per repo deferred-fix rules; severity preserved)

All carried-forward items from `rpf-cycle-7-aggregate.md` re-assessed this cycle; preconditions unchanged → RE-DEFER with severity preserved. Full ledger (file+line, severity, reason, exit criterion) is in `.context/reviews/cycle-8-2026-05-29-rpf/_aggregate.md` under "Re-assessed carried DEFERRED items." No security/correctness/data-loss finding is deferred (N8-C8-LIVERANK is scheduled above).

Key deferred items (severity NOT downgraded):
- **N7-C7 override overlay on the single-user live rank** — LOW/MED. Reason: mapping score_overrides onto the live rank (esp. ICPC, which has no override AC-time) needs a product decision; the N8 per-problem-best CTE only makes the IOI case *feasible*, it does not decide the product question. Exit: product decision on override AC-time source for ICPC, OR a cycle that adds override-aware live rank for IOI explicitly.
- **AGG-2** (rate-limit Date.now hot path + overflow sort) — MEDIUM. Exit: rate-limit-time perf cycle.
- **ARCH-CARRY-1** (raw API handlers) — MEDIUM. Exit: API-handler refactor cycle.
- **PERF-3** (anti-cheat dashboard) — MEDIUM. Exit: p99 > 800ms OR >50 concurrent contests.
- **D1/D2** (JWT clock-skew / per-request DB) — MEDIUM. Exit: auth-perf cycle; **fix must live OUTSIDE `src/lib/auth/config.ts`** per CLAUDE.md.
- **F3/F4/N3, DOC-C5-2** (worker trust/SELECT/index/dead field) — LOW. Exit: untrusted-worker support OR DB-profiling signal.
- **ARCH-CARRY-2** (SSE O(n) eviction) — LOW. Exit: SSE perf cycle OR >500 concurrent connections.
- **C1-AGG-3, C2-AGG-5, C2-AGG-6, C3-AGG-5, C3-AGG-6, AGG-7, AGG-9, C7-AGG-6, C7-DS-1, C7-DB-2-upper-bound, DEFER-ENV-GATES** — LOW. Exit criteria unchanged from cycle-7 ledger.

---

## Progress log
- [x] Task A query restructure (per-problem-best `per_problem` CTE then per-user SUM)
- [x] Task A docstring/comment correction (line ~196-215, N8-C8-LIVERANK + N7-C7 note)
- [x] Task A structural guard tests (2 new in `leaderboard-live-rank-logic.test.ts`)
- [x] Gates green (lint 0/0, tsc 0, build OK, test:unit 2472/321, lint:bash 0)
- [ ] Commit + push (GPG-signed, conventional + gitmoji)
- [ ] Deploy per DEPLOY_MODE=per-cycle
