# RPF Cycle 7 — critic (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `45502305`.
**Cycle-7 change surface vs prior cycle close-out:** **0 commits, 0 files, 0 lines.**

## Observations

### 1. Stale cycle-7 review set — orchestrator should recognize and supersede

A stale prior cycle-7 review run (rooted at `b0666b7a`, dated 2026-04-24) was found at `.context/reviews/rpf-cycle-7-*.md`. Its findings are inconsistent with HEAD `45502305`:

- AGG-1 (`/api/v1/time` uses `Date.now()`): RESOLVED at HEAD (uses `getDbNowMs()` + `force-dynamic`).
- AGG-2 (plaintext recruiting `token` column + `ri_token_idx` plaintext index): RESOLVED at HEAD (column dropped, only `tokenHash` + `ri_token_hash_idx` remain).

The orchestrator-driven cycle-7 reviews must **supersede** the stale set. This cycle's reviewers must overwrite the stale files (which they are doing) and the aggregate must record both as silently RESOLVED. No silent-drop violation: each stale finding is explicitly closed with HEAD evidence.

### 2. Backlog draw-down trend continues

Cycles 4-6 retired ~3 LOW carry-forwards per cycle (C3-AGG-8 / C3-AGG-4 / C2-AGG-7 in cycle-5, C5-SR-1 / C3-AGG-2 / C3-AGG-3 in cycle-6). Cycle-7 should continue at 2-3 LOW retirements per orchestrator directive.

### 3. Convergence indicators

- Cycle-7 change surface: 0 commits, 0 files vs prior cycle close-out HEAD `45502305`.
- Net `src/` lines changed in cycle-6: 0.
- New findings cycle-6: 0.
- New findings cycle-7: 0 (after stale-set audit).

This is a strong convergence signal. Per orchestrator's "convergence requires NEW_FINDINGS=0 AND COMMITS=0 in the same cycle", cycle-7 will likely produce non-zero COMMITS this cycle (plan + reviews + cycle-6 archive + 2-3 LOW draw-downs), so convergence is not yet declared.

### 4. Pre-emptive helper extraction is the right call

Code-reviewer + perf-reviewer both recommend extracting `useVisibilityAwarePolling` as a reusable primitive. I concur. The 7th-instance trigger for C2-AGG-5 is open-ended; pre-emptively extracting the helper retires the open-ended exit criterion and unblocks future polling components from contributing to the duplication count. This is genuinely better than waiting.

### 5. ARCH-CARRY-2 path-drift caveat

Stale cycle-7 review C7-PR-1 cites `src/app/api/v1/submissions/[id]/events/route.ts:48-63` for SSE O(n) eviction. The cycle-6 backlog's ARCH-CARRY-2 cites `src/lib/realtime/realtime-coordination.ts`. **These are two distinct sites of the same pattern.** Both are real. The cycle-7 plan should record this as a path-drift correction (no severity change), updating ARCH-CARRY-2 to enumerate both files.

### 6. Test gate stability — same DEFER-ENV-GATES carry-forward

Cycle-6 reported `npm run test:unit` 126 failures (up from 108 in cycle-5) attributed to CPU contention from concurrent gate execution. Cycle-7 should run gates **sequentially** (not in parallel with `next build`) to give a cleaner signal — or accept the carry-forward and not re-investigate.

## Critique of stale prior cycle-7 finding accuracy

The stale cycle-7 reviews correctly identified two real issues (time-route Date.now, plaintext recruiting tokens) that were genuinely present at base `b0666b7a` (April 24). Both have been silently fixed by intervening maintainer or RPF commits between April 24 and April 29 (cycle-1 through cycle-6 plus possibly out-of-loop commits). This is not an issue with the reviews themselves; it's a consequence of running RPF cycles asynchronously with maintainer work.

## NEW critic findings this cycle

**None.** No new code surface; backlog discipline holding; recommended draw-down picks are sane.

## Recommendation for cycle-7 PROMPT 2

1. Acknowledge the stale cycle-7 set; document closures with HEAD evidence.
2. Pick 2-3 LOW draw-downs:
   - **Doc closures** (3 items, no code): C7-CR-1/AGG-1 + C7-SR-2/AGG-2 (both silently RESOLVED at HEAD).
   - **C2-AGG-5 pre-emptive helper extraction** (≤ 100 lines): retires open-ended trigger.
   - **C7-TE-1 unit test for `/api/v1/time`** (≤ 30 lines): now valuable since endpoint uses DB time.
3. Path-drift correction for ARCH-CARRY-2: record both `realtime-coordination.ts` and `events/route.ts:48-63` as same finding.
4. C1-AGG-3 count update: 25 at HEAD, was reported as 21 in cycle-6 aggregate.

## Confidence

H.
