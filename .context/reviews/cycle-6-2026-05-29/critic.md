# Cycle 6 — Critic review (multi-perspective challenge)

**HEAD:** d1217b5a · Baseline green.

## On N6-C6 (the proposed cycle-6 fix)

**Is it real?** Yes. Confirmed by grep + admin-health logic. A SIGKILLed worker pins admin-health at `degraded` forever and accumulates rows. Multiple lenses (debugger, architect, tracer, verifier) independently converge on it. High signal.

**Is it worth fixing now?** Yes, and it is the natural completion of cycle-5 N1, which explicitly named this residual but deferred the status transition. Leaving it half-done means N1's value (no phantom capacity) is real but the user-visible symptom (permanent degraded health) persists.

**Counter-arguments considered:**
- *"Just change admin-health to ignore stale."* Rejected: `stale` is a legitimate transient signal (network blip); suppressing it would hide real short-lived degradation. The right fix is to give crashed workers a terminal state, not to blind the health check.
- *"Delete the row instead of marking offline."* Rejected: deletion loses post-mortem visibility (hostname, last heartbeat, deregisteredAt) and conflicts with the explicit admin-DELETE action's semantics. `offline` preserves the audit trail and matches the graceful-deregister terminal state.
- *"Add a separate cron reaper."* Rejected: over-engineering. The heartbeat sweep already runs on every heartbeat and already owns worker-row lifecycle mutations; one more WHERE-predicated UPDATE (or folding into the existing N1 reset UPDATE) is the minimal change.

**Risk of the fix:** Could clobber a live worker? No — same cutoff/guard as N1 (>=90 s floor, default 300 s, `status='stale'` filter). Reversible — a returning worker's heartbeat flips it back to `online` (`heartbeat/route.ts:67-73`, unconditional `status='online'`).

## On deferrals
F3 (worker-result trust), F4 (triple SELECT), N3 (failedTestCaseIndex), DOC-C5-2 (dead register field): preconditions unchanged. The plan must NOT silently drop them — re-record in the cycle-6 ledger with severity preserved. None are security/correctness/data-loss that became actionable this cycle.

## Verdict
Implement N6-C6 (fold into the N1 UPDATE + add `stale->offline`). Re-defer F3/F4/N3/DOC-C5-2 with preserved severity. No other net-new actionable findings.
