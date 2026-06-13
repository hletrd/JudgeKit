# Critic — RPF Cycle 7 (2026-06-13)

**HEAD reviewed:** 0472b007. Lens executed directly by the cycle agent (fallback per cycles 1–6).
Multi-perspective critique of the cycle-6 change surface and what it left behind.

## §1 — Cycle-6 fixed ONE instance of two defect CLASSES it had the evidence to fix everywhere
This is the cycle's biggest self-inflicted gap. Cycle-6 found and fixed:
- **(a) single-key offset ordering** → fixed only the submissions listing
  (`submissions/route.ts:167`), while 7 sibling offset/cap listings have the
  same shuffle (anti-cheat GET, audit-log ×2, login-log ×2, users, files,
  problems). CR7-1.
- **(b) poll-reset vs loadMore race + missing id-dedupe** → fixed only the
  participant timeline, while the anti-cheat DASHBOARD — same endpoint, same
  pattern — was left with the exact bug (CR7-2/D7-1/D7-2).
A reviewer that fixes the textbook case but not its siblings leaves the
codebase MORE confusing (now two paging implementations disagree). Cycle-7's
principal job is to close both classes consistently.

## §2 — The token invariant is asserted but not maintained
Cycle-6's commit message and module docstring claim "token expiry = effective
close, enforced uniformly." That is true at the instant of creation and false
forever after a schedule edit (A7-1/SEC7-1). An invariant that the code's own
comments assert but the code does not maintain is worse than no comment — a
future reader trusts it. Either maintain it (schedule-edit sync) or downgrade
the claim. The fix is small and the correct choice is to maintain it.

## §3 — Good calls in cycle-6 (credit where due)
- Queue-first `reportEvent` genuinely closes the last silent-telemetry-loss
  window; the reasoning in the commit body is correct and the tests pin it.
- The token-validity unification (one rule across 6 gates) is exactly the
  right shape; the only miss is the mutate-side lifecycle.
- Heartbeat LRU eviction on insert failure is a real correctness improvement
  for honest candidates' freshness margin.

## §4 — Process critique
The deferred register carried forward cleanly and no security/correctness
finding was silently dropped — good discipline. But "fix the canonical case,
defer the siblings implicitly" is a pattern to watch: siblings of a fixed bug
are not deferrals, they are unfixed instances of the same finding and must be
scheduled, not assumed-handled.

## Net
Cycle-7 should be a "finish the job" cycle: propagate the two cycle-6 fix
classes to all siblings, and complete the token lifecycle. No new feature
surface needed.
