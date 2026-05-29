# RPF Cycle 7 — Aggregate Review

**Date:** 2026-05-29
**HEAD reviewed:** 1f06bcd0 (main)
**Cycle:** 7/100 (orchestrator-numbered)
**Per-agent reviews:** `.context/reviews/cycle-7-2026-05-29/{code-reviewer,perf-reviewer,security-reviewer,critic,verifier,test-engineer,tracer,architect,debugger,document-specialist,designer}.md`
**Prior aggregates preserved:** `_aggregate-cycle-6-2026-05-29.md`, `_aggregate-cycle-5-2026-05-29.md`, `_aggregate-cycle-4.md`, `_aggregate-cycle-3.md`, `_aggregate-cycle-2-2026-05-29.md`, `_aggregate-cycle-1-2026-05-29.md`
**Baseline (re-run this cycle):** lint 0 errors/0 warnings, `tsc --noEmit` 0, `npm run build` 0, `npm run test:unit` 2465 tests / 320 files PASS, `npm run lint:bash` 0. All green.

---

## Scope
Per the broadening directive, this cycle focused on the contest scoring / leaderboard pipeline and the score-override flow, the submission/judging poll route, auth/RBAC on the override + leaderboard endpoints, and the Rust worker `api.rs`. Cycle-6 N6-C6 (`stale→offline` reaper) was verified landed + deployed. Open deferred items (F3/F4/N3/DOC-C5-2) were re-assessed.

---

## NEW deduplicated findings this cycle
**Severity tally (NEW only):** 0 HIGH, 1 MEDIUM, 0 LOW-actionable.

### N7-C7 — Score overrides are silently ignored by the contest leaderboard / export / analytics / audit / replay — **MEDIUM · HIGH confidence (gap) / MEDIUM (intent) · CONFIRMED · NOT DEFERRABLE (IOI portion)**
**Cross-agent agreement: 9 of 11 lenses** (code-reviewer, verifier, tracer, architect, debugger, critic, test-engineer, document-specialist, designer; perf + security concur it is a non-perf, non-security correctness bug). Strongest signal of the cycle.

- **Files:** override write + `invalidateRankingCache` → `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts:101-128, 206-216`. Ranking the cache targets (no `score_overrides` read) → `src/lib/assignments/contest-scoring.ts:197-443`, `src/lib/assignments/leaderboard.ts:108-235`. Gradebook engine that DOES apply overrides → `src/lib/assignments/submissions.ts:646-709`. Inheriting consumers → `leaderboard/route.ts:57`, `contests/[assignmentId]/export/route.ts:60`, `contest-analytics.ts:94`, `participant-audit.ts:23`, `contest-replay.ts:68`.
- **Problem:** The project has two scoring engines over the same `assignments`/`submissions` data. The gradebook (`getAssignmentStudentStatus`) overlays `score_overrides` (`bestScore = overrideScore`); the contest-ranking engine (`computeContestRanking` + `computeSingleUserLiveRank`) never reads `score_overrides`. So an instructor's override shows in the gradebook but NOT in the leaderboard, export CSV, analytics, participant-audit, or replay — two instructor-facing surfaces for the same assignment disagree.
- **Intent evidence (resolves H1 bug vs H2 intentional → H1):** commit `1bbec040 fix(ranking): 🐛 invalidate ranking cache on score override upsert and delete` exists solely to bust the ranking cache on override mutation, and `overrides/route.ts:123-127` cites the exact bug report ("changed the score but the ranking didn't update"). That cache-bust is a **no-op** for its stated purpose — recomputing yields the same override-blind ranking. No test asserts the omission in either direction. The documented intent is that overrides propagate to rankings; the `1bbec040` fix was incomplete.
- **Failure scenario:** Instructor regrades a contest problem (fixed test case / manual partial credit). Gradebook updates; the official leaderboard + exported standings CSV keep the stale ranking. Grades/standings diverge.
- **Fix (agreed; bounded):** Overlay `score_overrides` in `computeContestRanking` and `computeSingleUserLiveRank` exactly as the gradebook does, **for the IOI model** (override REPLACES the per-problem adjusted best score; presence test, not truthiness, so an override of 0 zeroes the problem; do NOT re-apply late penalty on top of an override). Mirror in the single-user live rank for frozen-mode parity. Prefer the gradebook's pattern (parallel small SELECT + in-memory overlay) over complicating the window-function SQL (perf-reviewer). Add regression tests + an invariant pin that the ranking path consults overrides. Update `docs/api.md` Score Overrides (DOC-C7-1). This makes the existing `invalidateRankingCache` calls meaningful.
- **ICPC sub-item — DEFERRED (genuinely undefined product behavior):** an override does not write `submissions.score`, so ICPC `hasAc`/`firstAcAt`/`wrongBeforeAc` have no natural mapping from an override (no AC timestamp). The gradebook is score-only and never models AC time for overrides, so the product has not defined ICPC-override semantics. Implementing a guessed ICPC behavior would manufacture scope (orchestrator anti-churn). Defer with exit criterion (below). The IOI correctness gap — the default model (`scoring_model` defaults to `ioi`) — is NOT deferred and is implemented this cycle.

### Informational / no action
- **DOC-C7-1** — `docs/api.md:698-731` is silent on override→ranking scope; folded into the N7-C7 fix (add one clarifying sentence). Not a standalone finding.

---

## Re-assessed carried DEFERRED items (severity preserved, NOT downgraded)
| ID | Severity | Confidence | Re-assessment this cycle | Status |
|---|---|---|---|---|
| N7-C7-ICPC (NEW sub-defer) | MEDIUM | MEDIUM | ICPC override→solved/penalty/firstAc semantics undefined by the product (override has no AC timestamp). IOI portion implemented; ICPC deferred to avoid guessing. | DEFER (new) |
| N7-C7-LIVERANK (NEW sub-defer) | MEDIUM | MEDIUM | Surfaced during implementation: `computeSingleUserLiveRank` IOI SQL SUMs per-submission adjusted scores (not per-problem bests), a pre-existing simplification distinct from N7-C7. Overlaying overrides cleanly needs a per-problem-best CTE restructure, which would entangle that pre-existing divergence; deferred to avoid regressing a frozen-mode-only indicative figure. Full board (override-aware) is authoritative. | DEFER (new) |
| F3 (worker result trust / score inflation) | LOW | MEDIUM | Trust model unchanged (trusted first-party workers only). Fix adds poll hot-path query, defends only vs compromised trusted worker. | RE-DEFER |
| F4 (≤3 `judge_workers` SELECTs per claim) | LOW | MEDIUM | Tiny indexed table; no DB-profiling signal; atomic claim CTE is the real gate. | RE-DEFER |
| N3 (failedTestCaseIndex = worker array position) | LOW | MEDIUM | Folds under F3 trust boundary; no prod mis-ordering observed. | RE-DEFER |
| DOC-C5-2 (register advertises hardcoded staleClaimTimeoutMs) | LOW | HIGH (non-impacting) | Rust worker only deserializes, never consumes. Dead field. | RE-DEFER |
| SSE-M2, SSE-RACE, COR-1, PERF-2, ARCH-1, ARCH-2, DEFER-52, C-1 (older ledger) | various | — | Preconditions unchanged; preserved in prior plans with exit criteria. | RE-DEFER |

No HIGH findings deferred. The N7-C7 IOI correctness gap is scheduled (not deferred); only the genuinely-undefined ICPC sub-behavior is deferred, with a stated exit criterion.

---

## Cross-agent agreement summary
- N7-C7 converged independently across 9 lenses — strongest signal. The bounding refinement (IOI now, ICPC deferred; parallel-SELECT overlay; presence-test not truthiness; no penalty double-apply; single-user live-rank parity) emerged from debugger + critic + perf + test-engineer.
- All lenses agree F3/F4/N3/DOC-C5-2 preconditions are unchanged → re-defer with preserved severity.
- No new HIGH/Critical, no security/data-loss, no Korean-typography or config.ts implications.

## Convergence status
One net-new actionable finding (N7-C7, MEDIUM). Not a zero-finding cycle.

## AGENT FAILURES
None. Note: this environment registers no project-specific `*-reviewer` subagents and the running general-purpose agent cannot recursively spawn subagents; the 11 specialist lenses were executed in-process by the cycle agent and written to per-agent files for provenance. All 11 lenses + aggregate completed.
