# Critic — RPF Cycle 5 (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `2626aab6`
**Cycle change surface vs cycle-4 close-out:** EMPTY.

## Headline critique

For the second consecutive cycle the change surface vs the prior cycle's close-out HEAD is empty. Cycle-4 closed three LOW deferred items (C3-AGG-7, C3-AGG-9, C3-AGG-10). The orchestrator's directive for cycle-5 is to "pick at least 2 LOW deferred items, ideally 3, so backlog shrinks; convergence requires NEW_FINDINGS=0 AND COMMITS=0 in the same cycle."

If we pick 2-3 LOW items this cycle, NEW_FINDINGS=0 holds, but COMMITS will be ≥ 2-3, so we are NOT converging this cycle by definition. That's expected — the loop must keep draining the backlog before convergence. Convergence is plausible only after the LOW backlog reaches 0 AND no new findings surface for one full cycle.

## C5-CT-1: Pick LOW items off the backlog this cycle (CONFIDENCE: High)

Following cycle-4's precedent (which retired 3 LOW items without regression), pick another 2-3 LOW items. Candidates ranked by risk × benefit:

1. **C3-AGG-8** (LOW, `deploy-docker.sh:129-133`) — Deploy-instance log prefix. Add a `[host=$DEPLOY_INSTANCE]` prefix to `info`/`success`/`warn`/`error` helpers when the env var is set. ~10-line shell edit, gated behind env var. Zero behavior change when unset.
2. **C3-AGG-4** (LOW, `package.json`) — Add `lint:bash` script invoking `bash -n` over `deploy-docker.sh` and `deploy.sh`. Script ships regardless of CI host availability. Local invocation works in this dev shell. Adding the script naturally meets the exit criterion.
3. **C2-AGG-7** (LOW, `src/components/recruiting/recruiting-invitations-panel.tsx`) — If the file still hard-codes `https://www.judgekit.dev`, replace with `process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.judgekit.dev'`. Single-file edit; behavior preserved.

Why these:
- C3-AGG-8 and C3-AGG-4 are deploy-script-only — zero `src/` risk.
- C2-AGG-7 is a single-line `src/` edit with a fallback that preserves cycle-4's behavior.
- Combined diff <40 lines.

## C5-CT-2: Cycle-4 plan archive readiness (CONFIDENCE: High)

The cycle-4 plan (`plans/open/2026-04-29-rpf-cycle-4-review-remediation.md`) has all tasks marked DONE or DEFERRED with explicit exit criteria. Ready to archive to `plans/done/` once cycle-5 plan is committed.

## C5-CT-3: User-injected TODO #1 status (CONFIDENCE: High)

`plans/user-injected/pending-next-cycle.md` TODO #1 closed in cycle 1 RPF (2026-04-29). No new entries. Re-checked at cycle-5 start; nothing new to ingest.

## C5-CT-4: Stale prior-cycle-5 review reconciliation (CONFIDENCE: High)

A pre-existing set of cycle-5 reviews (rooted at older base commit `4c2769b2`) was found in `.context/reviews/`. All actionable items in those reviews have been resolved or are subsumed under existing carry-forwards. The orchestrator-driven cycle-5 reviews (this one and parallel lanes) are now authoritative for cycle-5; the prior set is preserved as historical.

## NEW findings

None at HEAD `2626aab6` beyond the carry-forward backlog already enumerated.

## Confidence

**High.** Direct inspection.
