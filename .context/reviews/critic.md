# Critic (multi-perspective) — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. The critic's job: what is wrong with the SHAPE of what shipped, not just the lines.

## 1. The accommodation feature shipped as half a contract (the cycle's central critique)
Cycle 1 added staff time extensions; cycle 2 added the client-side deadline sync. Both cycles asked "can the student keep working?" and both verified YES (submissions honor `personal_deadline`, the countdown follows it). Neither cycle asked the dual question: **"does the platform keep doing its job while the student keeps working?"** It does not — the anti-cheat ingest still dies at `assignment.deadline` (`anti-cheat/route.ts:102-104`), so the accommodation window is unmonitored and, worse, the submission-time correlation manufactures `submission_stale_heartbeat` flags against the accommodated student (`submissions.ts:312-355`). The deeper defect is architectural discipline: "what is the effective end-of-exam for THIS user?" is now answered in three places with two different answers (submissions: max(deadline, personal); scoring: personal; anti-cheat: assignment-only). Until that question has ONE answer (a shared helper), every future consumer of exam time will re-roll this dice. See architect A3-1 for the consolidation shape; the immediate fix is CR3-1.

## 2. Documentation that misstates an integrity control is worse than no documentation
`docs/exam-integrity-model.md` is the document the owner will hand to colleagues/recruiters to justify trusting exam results. Its enforcement section (line 55) describes a hard 403 block that the code intentionally removed in favor of fail-open flagging. The doc is otherwise excellent precisely because it is honest about boundaries ("deliberate telemetry boundaries... decided posture, not omissions") — which makes the one dishonest paragraph more damaging: a reader has no reason to doubt it. Fix the paragraph; describe the fail-open + flag posture and what the reviewer must do with the flag.

## 3. The deploy-verification smoke now has a known false positive — and it was recorded as a "note for a future cycle"
Cycle-2's deploy record explicitly says the auraedu hero-heading smoke failure is "config-dependent expectation; the page renders correctly". Leaving a known-false-failing assertion in the smoke suite for even one cycle is how alert fatigue starts; the third time an operator sees red on auraedu they will stop reading the output. This cycle must make the expectation brand-aware (V3-3) — it is a 10-line change.

## 4. Per-cycle process critique
- Cycle 2 did the right thing extracting `run_remote_build`, but the recovery path's `tee` reuse of `$out_file` on retry discards the FIRST failure's log. If the retry also fails, the operator sees only the second log. Minor, but incident forensics would want both. (LOW, Medium — bundle if touching the script anyway; otherwise defer.)
- The cycle-2 plan marked G5's E2E as deferred under DEFER-ENV-GATES — correct per precedent, but the deferred register is now carrying 20+ items under a single CARRY row. The register remains auditable only because the cycle-1 plan is in `plans/done/`; consider re-materializing long-lived deferrals into the master backlog before the chain of "see previous plan" exceeds 3 hops (it is at 2 now). Housekeeping, LOW.
- Positive: the empirical BuildKit diagnosis → hardening → exit-criterion-met loop in DEFERRED-OPS-1 is exactly how ops findings should be closed. No critique.

## 5. What this cycle should NOT do
- Do not widen the extension feature (pre-start accommodations, roster-level overrides — IN2-2) as a side effect of fixing CR3-1; that is a product decision deferred with an owner exit criterion.
- Do not "fix" the heartbeat fail-open back to fail-closed while correcting the doc; the fairness rationale in the code comment is sound and the decision is the owner's, already made.

Summary: 3 actionable items this cycle (CR3-1 fix, doc truth fix, smoke brand-awareness), 2 LOW notes (retry log overwrite, register hygiene). The codebase remains in unusually good reviewed shape; the risk concentration is in cross-feature contracts, not in single files.
