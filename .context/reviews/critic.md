# Critic Pass — RPF Cycle 2/100

**Date:** 2026-04-26
**Lane:** critic
**Scope:** Multi-perspective critique of recent changes and overall change surface

## Summary

Cycle 1's review correctly identified AGG-1 (test mock fix), AGG-3/6 (anti-cheat dep cleanup), AGG-9 (aria-hidden) and remediated them. But it left source-code changes uncommitted in working tree, and Task B (analytics time reconciliation) was deferred entirely. The deferral was reasonable in cycle 1 but cycle 2 should resolve it.

## Critical Observations

### CRIT2-1: [HIGH] Test commits without source commits is a brittle pattern
The test in `c915da0b` references `getAuthSessionCookieNames`, which `5cde234e` doesn't add. The function only exists in the working tree of `src/lib/security/env.ts`. The aggregate AGG-1 says "proxy.ts now imports and calls getAuthSessionCookieNames()" — but proxy.ts only does that in the working tree. **This is exactly the "tests pass locally but break in CI" antipattern.**

The cycle 1 plan listed the right tasks but didn't call out that the source changes (the actual fix) needed to be committed first, with tests following. The committed sequence reverses this: tests first, source as uncommitted dangling work.

**Cycle 2 should:** commit source changes first (one per file: env.ts, proxy.ts, analytics route).

### CRIT2-2: [MEDIUM] Cycle 1 plan recorded Task B as "deferred to cycle 2 alongside AGG-5" but this cycle has the half-implementation in working tree
The deferral rationale was "behavioural change paired with new tests is safer." But the working tree shows the behavioural change without the tests. Either commit both together or revert the working-tree change and write the tests this cycle.

**Cycle 2 should:** Either (a) commit the Date.now() staleness change AND add API-level tests covering it, or (b) revert the working-tree analytics change and proceed with full Option 1 (Date.now() everywhere).

### CRIT2-3: [LOW] Cycle 1's "5 of 5 tasks done" is now claimed in the latest plan commit, but Task B is still `[d]`
Plan title at commit `b24167f9` says "4 of 5 tasks done" — accurate. The plan content at line 41 still labels Task B as deferred. Consistent and honest. No critique here, just confirming alignment.

### CRIT2-4: [LOW] Anti-cheat doc comments are well-written but verbose
The cycle-1 commit added ~40 lines of doc comments around `scheduleRetryRef` and `reportEvent`. Helpful for onboarding but the file grows. Trade-off accepted; no action.

### CRIT2-5: [INFO] Workspace-to-public migration directive — no opportunity surfaced this cycle
The user-injected long-term directive says cycle should make progress only where review finds opportunity. None of the working-tree or recent-cycle changes touch nav components. This cycle has no migration opportunity, and that's OK.

## Confidence

CRIT2-1 is HIGH-confidence — verified by inspecting `git show HEAD` for both files. CRIT2-2 is MEDIUM (analytics behavior is real but small).
