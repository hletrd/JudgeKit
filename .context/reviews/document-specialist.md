# Document-Specialist Pass — RPF Cycle 2/100

**Date:** 2026-04-26
**Lane:** document-specialist
**Scope:** Documentation/code mismatches, JSDoc accuracy, README drift

## Findings

### DOC2-1: [LOW] Plan claims Task B `[d]` (deferred) but working tree shows partial implementation
**File:** `plans/open/2026-04-26-rpf-cycle-1-review-remediation.md:37`
**Confidence:** HIGH

Plan status legend says `[d]` = "Deferred (with reason)". Task B is marked `[d]` and deferred to cycle 2. But the working tree contains the source modification. Documentation does not reflect implementation state.

**Fix:** Either revert the working-tree analytics changes and keep Task B deferred, or commit the change and update Task B to `[x]` with the actual decision recorded.

### DOC2-2: [LOW] Analytics route comment claims "30 seconds" tolerance and "1-2 seconds clock skew tolerable"
**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:58-59`
**Confidence:** MEDIUM

Comment says "30 seconds, so clock skew of 1-2 seconds between app and DB servers is acceptable." True under reasonable NTP. Under heavy NTP fail-over, drift can reach 10s+ briefly. Comment should clarify the assumption or pick a number with clearer guarantees.

**Fix:** Refine to "Date.now() and getDbNowMs() can drift up to N seconds in healthy operation; cap of 30s tolerates this." Or remove the speculative number.

### DOC2-3: [LOW] AGENTS.md vs `password.ts` mismatch — pre-existing, unchanged from cycle 1 AGG-11
Already deferred per cycle 1.

### DOC2-4: [INFO] Anti-cheat doc comments after cycle-1 commit `5cde234e` are accurate and complete
The `scheduleRetryRef` contract comment correctly describes the asymmetric semantics. The "no longer used" comment on the dep array is accurate.

### DOC2-5: [INFO] CLAUDE.md and AGENTS.md match repo state for typography rules and config preservation
Verified: `src/lib/auth/config.ts` is not modified in working tree. CLAUDE.md rule "use current config.ts as-is during deploy" is honored.

## Confidence

DOC2-1 is the most actionable — plan ↔ implementation drift.
