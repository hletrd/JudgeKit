# RPF Cycle 6 — critic (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `a18302b8`
**Diff vs cycle-5 base:** 0 lines.

## Methodology

Examined the cycle-5 plan's claims, the orchestrator's PROMPT-2 directive, the stale prior cycle-6 review aggregate's findings, and the live codebase. Looking for: things the loop is missing, items rationalized away too quickly, mismatches between claims and reality.

## Critical observations

### 1. The loop is on a healthy slope, but the rate of carry-forward retirement is slow

Cycle 4 retired 3 items, cycle 5 retired 3, the orchestrator's directive for cycle 6 is to retire 2-3 more. At ~3/cycle, the 17 currently-deferred items would clear in ~6 cycles **assuming no new findings.** That's a realistic budget. The risk is that NEW findings outpace draw-down — but the empty change surface this cycle (0 lines) means no new findings, which means the loop CAN make progress.

**Critic's directive:** cycle 6 should pick **3 LOW items**, not 2. The orchestrator said "ideally 3"; the change surface is empty; no execution risk to bundling 3 fine-grained commits.

### 2. Path drift creates silent staleness in deferred entries

AGG-2 referenced `src/lib/api-rate-limit.ts:56`; that path doesn't exist at HEAD. The actual `Date.now()` calls are now in `src/lib/security/in-memory-rate-limit.ts`. Same kind of drift for PERF-3 (`src/lib/anti-cheat/` cited, but the actual gap query lives in `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`).

**Action:** the cycle-6 plan MUST update the carry-forward registry with corrected paths so future cycles don't re-investigate the same drift.

### 3. The stale prior cycle-6 reviews are an unexpected gift

A previous run wrote `rpf-cycle-6-*.md` rooted at base `d5980b35`. Of its 7 actionable AGG findings (AGG-1..AGG-7), **all 7 are silently fixed at HEAD `a18302b8`.** That is real, organic progress — the maintainer has been fixing things in non-orchestrator commits between cycles.

**Critic's directive:** treat this as concrete evidence that the team is healthy. The cycle-6 aggregate must **explicitly note all 7 stale findings as resolved** so they aren't re-observed in cycle 7+ as new.

### 4. ARCH-CARRY-1 and C1-AGG-3 are silently shrinking

ARCH-CARRY-1's "22+" threshold is now met at 20. C1-AGG-3's "27 client console.error sites" is now 21. Those drops happened between cycle 4 and cycle 6 with no targeted intervention. This is good news but exposes a question: **at what threshold do we close the deferred entry?**

**Critic's directive:** keep the entries open with corrected counts; don't close them just because they shrunk. Close only when the population reaches 0 OR a dedicated cycle retires them in bulk.

### 5. D1/D2 (auth JWT carry-forwards) are blocked by a repo policy that prevents direct fix

`CLAUDE.md` says "Preserve Production config.ts" — `src/lib/auth/config.ts` (418 lines) cannot be modified. Any clock-skew or per-request-DB-query fix must live OUTSIDE that file. This is not a critique of the policy; it's a critique of the deferred entry, which doesn't currently note the constraint.

**Critic's directive:** annotate D1/D2 in the cycle-6 plan with "implementation must be wrapper-based (not in src/lib/auth/config.ts) per CLAUDE.md repo policy".

## NEW findings this cycle

**0 HIGH, 0 MEDIUM, 0 LOW NEW.** No new code-class issues to inject.

## Recommendation

Pick **C5-SR-1**, **C3-AGG-3**, **C3-AGG-2** for cycle-6 LOW draw-down. Annotate D1/D2 with the config.ts constraint in the cycle-6 plan. Update AGG-2 and PERF-3 paths in the cycle-6 plan's carry-forward registry. Mark all 7 stale prior cycle-6 AGG-1..AGG-7 findings as "RESOLVED at HEAD" in the aggregate.

Confidence: H.
