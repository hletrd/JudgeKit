# Cycle 7 RPF Review Remediation Plan

**Date:** 2026-05-29
**Cycle:** 7/100 of this RPF loop (orchestrator-numbered)
**HEAD at review:** 1f06bcd0 (main)
**Aggregate:** `.context/reviews/_aggregate.md` (cycle-7)
**Per-agent reviews:** `.context/reviews/cycle-7-2026-05-29/{code-reviewer,perf-reviewer,security-reviewer,critic,verifier,test-engineer,tracer,architect,debugger,document-specialist,designer}.md`
**Prior-cycle aggregates preserved:** `_aggregate-cycle-6-2026-05-29.md`, `_aggregate-cycle-5-2026-05-29.md`, `_aggregate-cycle-4.md`, `_aggregate-cycle-3.md`, `_aggregate-cycle-2-2026-05-29.md`, `_aggregate-cycle-1-2026-05-29.md`

---

## Summary

Cycle 7 reviewed the contest scoring / leaderboard pipeline and the score-override flow, the submission/judging poll route, auth/RBAC on the override + leaderboard endpoints, and the Rust worker `api.rs`. Cycle-6 N6-C6 (`stale→offline` reaper) verified landed + deployed. Baseline fully green (lint 0/0, tsc 0, build 0, test:unit 2465 / 320 files, lint:bash 0).

**1 net-new actionable finding (implement now, IOI portion), 1 new deferred sub-item (ICPC override semantics — genuinely undefined by the product), 4 carried deferred (F3/F4/N3/DOC-C5-2, severity preserved).** No High/Critical, no data-loss, no remote-exploit.

### N7-C7 — Score overrides silently ignored by the contest leaderboard / export / analytics / audit / replay (MEDIUM; 9-of-11-lens agreement; IOI portion NOT deferrable — instructor-facing correctness + two-engine consistency)

The project has two scoring engines over the same `assignments`/`submissions` data:
- Gradebook `getAssignmentStudentStatus` (`src/lib/assignments/submissions.ts:646-709`) — **applies** `score_overrides` (`bestScore = overrideScore`).
- Contest ranking `computeContestRanking` (`src/lib/assignments/contest-scoring.ts:197-443`) + `computeSingleUserLiveRank` (`src/lib/assignments/leaderboard.ts:108-235`) — **never reads** `score_overrides`.

So an instructor's override appears in the gradebook but NOT in the leaderboard, export CSV (`contests/[assignmentId]/export/route.ts:60`), analytics (`contest-analytics.ts:94`), participant-audit (`participant-audit.ts:23`), or replay (`contest-replay.ts:68`). The override route calls `invalidateRankingCache(assignment.id)` (`overrides/route.ts:128, 216`) — added by commit `1bbec040 fix(ranking): 🐛 invalidate ranking cache on score override upsert and delete` whose comment cites the bug report "changed the score but the ranking didn't update" — but that cache-bust is a no-op for its stated purpose because recomputing yields the same override-blind ranking. The documented intent is that overrides propagate to rankings; the `1bbec040` fix was incomplete.

**FIX (bounded to IOI):** Overlay `score_overrides` in `computeContestRanking` and `computeSingleUserLiveRank` for the IOI model, mirroring the gradebook: the override REPLACES the per-problem adjusted best score (presence test `IS NOT NULL` / `!== undefined`, NOT truthiness — an override of 0 must zero the problem; late penalty must NOT be re-applied on top of an override). Prefer the gradebook's pattern: fetch overrides via a parallel small `SELECT` and overlay in memory rather than complicating the window-function SQL. Add regression tests + an invariant pin that the ranking path consults overrides. Add one clarifying sentence to `docs/api.md` Score Overrides (DOC-C7-1).

**ICPC sub-behavior — DEFERRED:** an override does not write `submissions.score`, so ICPC `hasAc`/`firstAcAt`/`wrongBeforeAc` have no natural mapping from an override (no AC timestamp). The product has not defined ICPC-override semantics; implementing a guess would manufacture scope. Deferred with exit criterion (ledger below).

---

## Implementation tasks

| # | Task | Severity | Status |
|---|---|---|---|
| 1 | In `src/lib/assignments/contest-scoring.ts`, fetch `score_overrides` for the assignment (small SELECT after the assignment-problem fetch) and overlay onto the per-problem IOI score in `_computeContestRankingInner`: when an override exists for `(userId, problemId)`, use it as the problem's `score` (replace `bestScore`), keeping `solved = score >= ap.points`. Presence test on the override map (`!== undefined`), not truthiness. Do not re-apply late penalty on overridden problems. Also handle the no-submission-row case (override applies even when the user has no submission for that problem). ICPC path unchanged (deferred). | MED (N7-C7) — NOT DEFERRABLE (IOI) | [x] |
| 2 | `src/lib/assignments/leaderboard.ts` `computeSingleUserLiveRank` (IOI branch): SCOPED DOWN — the live-rank SQL SUMs adjusted scores across submission rows rather than per-problem bests (a pre-existing simplification distinct from N7-C7), so a clean override overlay requires restructuring it to a per-problem-best CTE. To avoid entangling that pre-existing divergence and risking a regression, the override overlay on the live rank is DEFERRED (sub-item of N7-C7) and the function is documented to NOT apply overrides; the authoritative override-aware standings come from `computeContestRanking`. | MED (N7-C7) — sub-deferred | [d] documented + ledger |
| 3 | Add regression tests (`tests/unit/assignments/contest-scoring-overrides.test.ts`): (a) IOI ranking honors override (replace; outranking changes); (b) override of 0 zeroes the problem (presence not truthiness); (c) override does not double-apply late penalty; (d) no-override no-op; (e) override on an unattempted problem (no row) still applies. 5 cases. | MED (N7-C7) | [x] |
| 4 | Update `docs/api.md` Score Overrides section with a sentence stating an override replaces the student's effective score in both the gradebook and the IOI contest leaderboard/export, noting the ICPC + live-rank caveats (deferred). | LOW (DOC-C7-1, folded) | [x] |
| 5 | Run all gates: `npm run lint`, `tsc --noEmit`, `npm run build`, `npm run test:unit`, `npm run lint:bash` (whole repo). Fix any error-level gate output before commit. | — | [ ] |
| 6 | Commit + push fine-grained, GPG-signed, conventional + gitmoji. | — | [ ] |
| 7 | Run per-cycle `DEPLOY_CMD` (algo flags) after gates green. No schema change expected (reads existing `score_overrides`). | — | [ ] |
| 8 | Housekeeping: completed cycle-6 plan moved to `plans/done/`; stale older `.context/plans/open/2026-05-14-cycle-6-review-remediation.md` archived to `.context/plans/open/_archive/`. | — | [x] done this cycle |

---

## Quality gates

- [x] `npm run lint` — 0 errors, 0 warnings (exit 0)
- [x] `tsc --noEmit` — PASS (exit 0)
- [x] `npm run build` — PASS (exit 0)
- [x] `npm run test:unit` — PASS (2470 / 321 files; +5 N7-C7 cases from the 2465 baseline)
- [x] `npm run lint:bash` — PASS (exit 0)

---

## Deferred ledger (cycle 7)

Per `plans/open/README.md` and the orchestrator deferred-fix rules, every still-open finding is either implemented above or recorded here with severity preserved (NOT downgraded) and a stated exit criterion. The N7-C7 IOI correctness gap is NOT deferred. No security/correctness/data-loss item is deferred without basis.

| ID | Severity | Confidence | File | Reason for deferral | Exit criterion |
|---|---|---|---|---|---|
| N7-C7-ICPC (new) | MEDIUM | MEDIUM | `src/lib/assignments/contest-scoring.ts` ICPC branch; `leaderboard.ts` ICPC live-rank | An override writes only `score_overrides.overrideScore`, never `submissions.score`. ICPC ranking derives `hasAc`/`firstAcAt`/`wrongBeforeAc` from judged submissions; an override has no AC timestamp, so its effect on solved-state and penalty (which depends on first-AC time) is undefined by the current product. The gradebook is score-only and never models AC time for overrides. Implementing a guessed ICPC-override mapping would be net-new scope, not a review-finding fix. Severity preserved (same as the IOI gap). | Re-open when the product defines ICPC-override semantics (e.g., override == problem points ⇒ solved, with an explicit AC-time source — override `createdAt`? contest start? — chosen by the product owner). Then apply the same overlay to the ICPC branch + ICPC live-rank with tests. Or sooner if an ICPC contest reports an override not reflected on the leaderboard. |
| N7-C7-LIVERANK (new) | MEDIUM | MEDIUM | `src/lib/assignments/leaderboard.ts` `computeSingleUserLiveRank` IOI branch (~:196-234) | The single-user IOI live-rank SQL SUMs per-submission adjusted scores grouped by user rather than per-problem bests (a pre-existing simplification, distinct from N7-C7), so it already diverges from the full board on multi-submission cases. Cleanly overlaying `score_overrides` requires restructuring it to a per-problem-best CTE, which would entangle and silently change that pre-existing behavior and risk a regression in a frozen-mode-only, single-student indicative figure. The full board (`computeContestRanking`) IS now override-aware and is the authoritative standings. Severity preserved. | Re-open together with a deliberate fix of the live-rank SUM-vs-MAX per-problem-best divergence: restructure the IOI live-rank to a per-problem-best CTE and overlay overrides via LEFT JOIN, with parity tests against the full board. Or sooner if a frozen-mode student's live rank visibly contradicts the post-freeze board on an overridden problem. |
| F3 (carried) | LOW | MEDIUM | `src/app/api/v1/judge/poll/route.ts:134`; `src/lib/judge/verdict.ts:39-46` | Worker result trust: `score = passed/results.length`; `testCaseId` FK-constrained but not scoped to the claimed problem. Gated by claimToken ownership + per-worker secret + IP allowlist (trusted first-party-worker model). Trust model UNCHANGED this cycle; the fix adds a poll hot-path query and defends only vs a compromised trusted worker. Severity preserved. | Re-open if untrusted/third-party workers become possible, OR a worker bug is observed inflating scores in prod. Then validate reported `testCaseId`s ∈ the claimed problem's test-case set and compare `results.length` to the problem's test-case count before scoring. |
| F4 (carried) | LOW | MEDIUM | `src/app/api/v1/judge/claim/route.ts:130,143-150,298-306`; `src/lib/judge/auth.ts:62` | Up to 3 SELECTs of the same `judge_workers` row per claim. Bounded by worker count on a tiny indexed table; the atomic claim CTE is the real gate. No measurable cost / no profiling signal. | Re-open if the claim path appears in DB profiling, or fold into a refactor that returns the auth-helper's already-fetched worker row. |
| N3 (carried) | LOW | MEDIUM (informational) | `src/lib/judge/verdict.ts:22-31`; `src/components/submission-status-badge.tsx` | `failedTestCaseIndex` is the worker-supplied array position displayed as the failing test ordinal; alignment with the problem's `sortOrder` is a worker-contract assumption gated by the same trusted-worker boundary as F3. Not a confirmed defect under the current trust model. | Re-open together with F3 if untrusted/third-party workers become possible, OR if a mis-ordered index is observed in production. Then map reported `testCaseId`s back to `sortOrder` server-side before computing `failedTestCaseIndex`. |
| DOC-C5-2 (carried) | LOW | HIGH (non-impacting) | `src/app/api/v1/judge/register/route.ts:22,75`; `judge-worker-rs/src/types.rs` | The register response advertises hard-coded `staleClaimTimeoutMs = 300_000` while the claim route enforces the admin-configurable `getConfiguredSettings().staleClaimTimeoutMs`. The Rust worker only deserializes this field and never reads it for logic — dead field, behavioral impact nil. | Re-open when the register route is next touched, OR if the worker ever starts consuming the advertised timeout. Then advertise the live configured value, or remove the dead field. |

### Carried-over from earlier ledgers (still open — NOT re-counted as cycle-7 new)
SSE-M2, SSE-RACE (events route), COR-1 (problem lookup outside tx), PERF-2 (sequential Docker image fetches), ARCH-1 (generic 500 in `createApiHandler`), ARCH-2 (dual token system), DEFER-52 (Docker output string accumulation), C-1 (nginx XFF spoof — infra), and the cycle-3 ledger F3c3–F8c3. All remain valid in their archived plans with exit criteria.

---

## Progress

- [x] Per-agent reviews written (`.context/reviews/cycle-7-2026-05-29/`, 11 lenses)
- [x] Aggregate written (`.context/reviews/_aggregate.md` cycle-7; cycle-6 preserved as `_aggregate-cycle-6-2026-05-29.md`)
- [x] Plan written
- [x] Cycle-6 plan archived (`plans/done/2026-05-29-cycle-6-rpf-review-remediation.md`); stale older cycle-6 plan archived to `.context/plans/open/_archive/`
- [x] N7-C7 IOI overlay implemented in `computeContestRanking` (`contest-scoring.ts`) + 5 regression tests (`tests/unit/assignments/contest-scoring-overrides.test.ts`). Single-user live-rank overlay sub-deferred (N7-C7-LIVERANK) with documented rationale.
- [x] docs/api.md updated (DOC-C7-1)
- [x] Gates green (lint 0/0, tsc 0, build 0, 2470 tests / 321 files, lint:bash 0)
- [ ] Committed (fine-grained, GPG-signed) + pushed to main
- [ ] Deployed (per-cycle)
