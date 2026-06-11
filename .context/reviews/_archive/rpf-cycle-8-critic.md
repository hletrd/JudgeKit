# RPF Cycle 8 — Critic

**Date:** 2026-04-29
**HEAD reviewed:** `1c991812`
**Change surface:** 0 commits, 0 files, 0 lines vs cycle-7 close-out.

## Findings

**0 NEW.** Trend across cycles 4-7: NEW_FINDINGS = 0/1/0/0. Cycle 8 likely 0 again given empty change surface.

## Critique of cycle-7 work

The cycle-7 plan executed cleanly:
- Task A (stale-AGG-1 closure for `/api/v1/time` Date.now): documented as silently RESOLVED. Correct — the route at HEAD uses `getDbNowMs()` and exports `dynamic = "force-dynamic"`.
- Task B (stale-AGG-2 closure for plaintext recruiting token column): documented as silently RESOLVED. Correct — schema only has `tokenHash` and `ri_token_hash_idx`.
- Task C (source-level regression test for `/api/v1/time`): test landed in `9e928fd1`. Test is well-targeted and runs without env dependencies.
- Task ZZ (archive cycle-6 plan): completed.

**Critic observations:**

1. **C1-AGG-3 count drift, count-only:** the count drifts (21 → 25 → now 24 at HEAD via cycle-8 grep). The metric is itself unstable as the codebase evolves; the underlying severity (LOW) and exit criterion (telemetry/observability cycle) don't change. Counting individual `console.error` lines as the convergence signal is increasingly noisy. **Recommend** explicitly recording in cycle-8 plan that the count is "population variable; severity unchanged; do not treat ±N drift as new finding". This was already done in cycle-7 aggregate; reaffirm.

2. **AGG-5 closure was rolled into cycle-7 Task C**, which is correct, but the cycle-7 aggregate's "Total deduplicated NEW findings" said "**0 HIGH, 0 MEDIUM, 0 LOW NEW**" while simultaneously implementing one item ("AGG-5 unit test"). Strictly that item *was* a stale-cycle-7 finding flagged at AGG-5 — not a NEW finding for cycle 7 — so the aggregate was internally consistent. Pedantic but correct. **No action needed.**

3. **Convergence prospects:** orchestrator directive states convergence requires `NEW_FINDINGS=0 AND COMMITS=0` in the same cycle. Cycle 8 starts with 0 NEW findings (empty change surface). To converge in cycle 8, the cycle would have to commit 0 changes — but orchestrator also directs picking 2-3 LOW deferred items for implementation. These directives are in tension. **Recommend** picking 2-3 LOW items so backlog draws down (commits will be > 0); convergence is naturally pushed to a later cycle when no LOW items remain to draw down (LOW backlog is finite — currently ~16 items including DEFER-ENV-GATES, so convergence is approaching but not imminent).

4. **Cycle-7 aggregate listed "AGG-5 IMPLEMENTING THIS CYCLE (LOW draw-down)" while severity in the same row was MEDIUM** (per stale review label). The implementation was a low-risk test addition, but the severity label conflict (MEDIUM-stale-as-test-gap vs LOW-draw-down) is a minor record-keeping inconsistency. **Recommend** future cycles use the original severity label and mark the *picking* as a LOW draw-down regardless. (No regression; cycle-7 work was correct.)

## Recommendations for cycle 8 picks

Critic concurs with code-reviewer + perf-reviewer + security-reviewer triad:

- **Pick 1: C7-DS-1** — README doc for `/api/v1/time`. Doc-only. ≤ 30 lines. Zero code risk. Closes a real user-facing gap (developer onboarding question class).
- **Pick 2: C7-DB-2-upper-bound** — `DEPLOY_SSH_RETRY_MAX` soft upper bound. ≤ 10 lines bash. Operator-clarity improvement. Lightweight.
- **Pick 3 (optional)**: **C7-AGG-9 partial** — add a one-page architectural note in `src/lib/security/README.md` or top-of-file comment in each rate-limit module pointing readers at the canonical entrypoint. **Doc-only, no code refactor.** Reduces drift risk while deferring the actual consolidation. ≤ 30 lines doc. **Conservative gold-plating risk:** writing a doc that goes stale faster than it gets read. Recommend SKIPPING this third pick unless cycles 1+2 are very fast.

**Final critic recommendation:** Picks 1 and 2 only. Avoid pick 3 unless time remains.

## Critic verdict

Cycle-7 work is internally consistent, correctly executed, well-recorded. Cycle 8 should be a similar low-risk doc + light-bash close-out cycle.

## Confidence

H on critique points 1-4; M on pick-3 skip recommendation.
