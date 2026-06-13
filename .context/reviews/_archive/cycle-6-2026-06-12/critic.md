# Critic — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f. Multi-perspective critique of the current change surface and the program's own habits.

## 1. The platform's weakest authz story is now the token lifecycle, not the monitor
Five cycles hardened the anti-cheat evidence chain to near-pedantic precision (flags only on accepted submissions, DB-time stamping, probe/record separation) while the *access* substrate underneath it kept two semantics for one row type and no revocation path at all (SEC6-1). An owner running a recruiting test cares more about "removing a candidate actually removes them" than about a 60 s heartbeat nuance. Priority of this cycle should reflect that inversion: fix the token lifecycle first.

## 2. The monitor work is one fix away from a clean claim
After AGG6-2 (queue-first `reportEvent`) the telemetry pipeline has a single, crash-safe transmission path and the documentation can finally say "no silent client-side loss below MAX_RETRIES" without footnotes. Stopping one fix short of that claim last cycle was reasonable scoping; not finishing it this cycle would be negligence — the residual was explicitly parked "for the next monitor pass" and this is that pass.

## 3. Consistency debt keeps being cheaper to pay than to carry
Two cycle-6 findings (dead `service_unavailable` vocabulary; the false `canManageContest` comment) are pure carry-cost: each future reader pays a comprehension tax until someone deletes ten lines. The program's own history (CR5-2's dead `??` fallback, AGG5-5's unreachable enum branch) shows these don't age out — they multiply. Good norm to keep: every cycle deletes its own dead vocabulary.

## 4. Where the program is over-investing
The anti-cheat dashboards are now reviewed more deeply per cycle than the grading/score-override surfaces that determine actual outcomes. Nothing in cycles 4–6 re-validated score overrides, leaderboard freeze, or CSV export against regressions (they are stable, but "stable" was also true of the token gates). Recommendation for cycle 7+: rotate one deep lens onto the scoring/export surfaces even if the diff didn't touch them.

## 5. Register hygiene is part of the product
The stale user-injected register (V6-6) is the kind of small rot that erodes trust in the whole plan system: if HIGH-priority items can sit "ONGOING" for six weeks after completion, the register stops being load-bearing. The fix is mechanical; the norm it protects is not.

## Concur/dissent on severity
- Concur MEDIUM for SEC6-1 (not HIGH: every token creator also enrolls today, so exploitation requires a staff roster action first; no anonymous path).
- Concur MEDIUM for AGG6-2 (evidence loss, not access loss; bounded by MIN_INTERVAL dedup and the rarity of unload-during-send).
- Would downgrade D6-3 to LOW noise if the LRU fix were costly — it is a two-line `catch`, so fix it.
