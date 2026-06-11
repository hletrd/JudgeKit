# RPF Cycle 9 — Critic

**Date:** 2026-04-29
**HEAD reviewed:** `1bcdd485`.

## Honest assessment of cycle-8

Cycle 8 picked **3 LOW backlog items** as directed (the orchestrator asked for 2-3, and the cycle-8 critic agreed on 3 picks). All three landed:
- README `/api/v1/time` doc (commit `1cdf79ed`).
- `DEPLOY_SSH_RETRY_MAX` soft cap (commit `d9cb15e6`).
- Rate-limit module orientation comments (commit `9c8d072e`).

Plan-vs-implementation reconciliation: **clean.** No drift; no silent drops. Path/count drift corrections recorded explicitly.

## Cycle-9 stance

The cycle-9 trend (cycles 4-8 ran NEW_FINDINGS = 0/1/0/0/0) suggests the surface is genuinely converging. The orchestrator notes the convergence criterion is `NEW_FINDINGS=0 AND COMMITS=0 in the same cycle` — and cycle 9 has *0 NEW findings* available so far, but the orchestrator directive ("Pick at least 2-3 LOW items this cycle so backlog continues to shrink") forces COMMITS > 0. Therefore convergence cannot trigger this cycle by directive.

The critical question: which 2-3 LOW items are well-scoped enough for cycle 9? Several MEDIUM items are real engineering work (D1/D2 auth, ARCH-1 20-handler refactor, AGG-2 rate-limit perf, ARCH-2 SSE eviction, PERF-3 anti-cheat). I will not endorse picking any MEDIUM item from this list without a dedicated cycle. The LOW items still on the books are mostly perf-trigger-gated (C2-AGG-5/6, C1-AGG-3, C3-AGG-5/6, C7-AGG-6, C7-AGG-7, ARCH-CARRY-2, DEFER-ENV-GATES) where the trigger has not fired.

## Pick recommendations for cycle 9 (LOW only, narrow scope)

After examining the deferred backlog for items that meet "well-scoped, doc-leaning, ≤30 lines per item, no security/correctness regression":

1. **C7-AGG-7 partial mitigation — add a top-of-file warning comment to `src/lib/security/encryption.ts`** flagging the plaintext-fallback path on lines 79-81, the audit/incident exit criterion, and a TODO marker that links to the eventual hard removal. This mirrors the cycle-8 strategy (cross-reference comments) for the encryption module. Estimated diff: ~10 lines, doc-only.

2. **C3-AGG-5 acknowledgment — document the third independent SSH-helpers cycle in `deploy-docker.sh` top-of-file comment** so the trigger ("3 indep cycles modify SSH-helpers") is on the record at the file head, making it impossible for a future cycle to silently bypass the refactor trigger. Estimated diff: ~5 lines, doc-only.

3. **README — document the `lint:bash` script that was added cycle 5** but is missing from any visible build/test/lint listing in README. New contributors won't know it exists. Estimated diff: ~3-6 lines, doc-only.

All three are doc-leaning, total < 40 lines, and address real backlog gaps (incident-response readiness for encryption fallback, refactor-trigger visibility for deploy-docker.sh, contributor-onboarding for lint:bash).

**Rejected for this cycle:**
- D1/D2 (auth JWT) — MEDIUM, multi-file, requires careful design; not appropriate for an orchestrator-driven 1-cycle pick.
- AGG-2 (rate-limit `Date.now`) — MEDIUM, hot-path; needs benchmarks and a dedicated perf cycle.
- ARCH-CARRY-1 (20 raw handlers) — MEDIUM, 20-file refactor; far too large for one cycle.
- ARCH-CARRY-2 (SSE eviction) — LOW, but trigger ">500 concurrent connections" not met; reactive trigger is correct policy.
- PERF-3 (anti-cheat heartbeat) — MEDIUM, trigger ("p99>800ms OR >50 concurrent contests viewed") not met.
- C2-AGG-5 polling helper extraction — LOW, but trigger "telemetry signal OR 7th instance" not met (still 5 sites at HEAD).
- C1-AGG-3 console.error — LOW, but trigger "telemetry/observability cycle opens" not met; reactive trigger is correct policy.

## Honest critique of the system

The cycle is settling into a stable rhythm of small doc-leaning picks, which is appropriate given that the meaningful backlog work (D1/D2/ARCH-1/ARCH-2/AGG-2/PERF-3) is *real engineering*. Forcing those into 1-cycle picks would either skim the surface or risk regressions. The current pace — pick 2-3 LOW items per cycle, defer MEDIUM with sharp exit criteria — is the right pace.

I'd warn the orchestrator that **picking 3 doc-leaning items per cycle is sustainable for ~5-10 more cycles before the LOW backlog is exhausted**. After that, either MEDIUM items must be scheduled (with a dedicated cycle each) or the orchestrator should signal convergence acceptance and stop forcing COMMITS > 0 even when NEW_FINDINGS = 0.

## Confidence

High on "0 NEW findings" assessment. High on cycle-8 reconciliation (clean). Medium on the cycle-9 picks list — doc-only items are low risk but contribute marginal value; the orchestrator may consider declaring convergence accepted in 5-10 cycles.
