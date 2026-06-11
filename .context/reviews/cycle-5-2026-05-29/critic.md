# Critic — Cycle 5 (2026-05-29)

Multi-perspective critique of the cycle-5 change surface (judge worker lifecycle /
scheduling / result-trust, rate limiter, contest scoring, Rust worker).

## On N1 (active_tasks leak)
Agree it is real and net-new, but resist over-stating severity. Three mitigations
make it Low-to-Medium, NOT High:
1. Restarted workers register as fresh rows (active_tasks=0) — no self-lockout.
2. The claim CTE's `status='online'` gate means a stale row's leaked counter is
   never consulted for scheduling.
3. The dashboard's live-capacity sum is over `online` rows only.
The genuine harm is (a) sticky `degraded` health (admin-health.ts:89 on `stale>0`)
and (b) unbounded orphan-row growth. The fix MUST NOT zero `active_tasks` on the
mere `stale` threshold (90 s) — a transiently-slow worker is still doing real work
and its next heartbeat flips it back to `online`. Only zero once the row is stale
past the STALE-CLAIM timeout (300 s), by which point any in-flight claim has
provably been reclaimed. A naive "zero on stale" would corrupt live workers.
This nuance is the most important constraint on the fix.

## On implementing F3 this cycle (orchestrator asked "if actionable")
Recommend AGAINST. The cycle-4 critic already cautioned against over-engineering
full-result validation, and nothing about the trust model changed this cycle.
Adding a problem-test-case-set fetch + count check to the poll hot path defends
only against a compromised TRUSTED worker — a threat explicitly out of scope per
the deferral's exit criterion. Implementing it now would be speculative hardening,
not a response to a confirmed defect. Keep deferred.

## On N2 (rate-limit param naming)
Cosmetic. Worth a one-line rename/doc but do not gold-plate into a rate-limit
refactor.

## Net assessment
1 substantive net-new finding (N1, fix this cycle with the stale-claim-timeout
guard) + 1 cosmetic (N2). No High/Critical, no data-loss, no remote exploit. The
right-sized cycle-5 deliverable is the N1 sweep fix + its regression test + the N2
rename, then keep F3/F4 deferred with severity preserved.
