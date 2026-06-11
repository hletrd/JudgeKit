# Critic review — RPF cycle 4 (2026-06-11)

**HEAD reviewed:** 7c0a4bd4 · gates green.
**Lens:** multi-perspective critique of the current change surface and of the
loop's own blind spots.

## 1. The anti-cheat evidence chain is the product, and it is currently lying in both directions
Three cycles hardened WHO can extend exams, WHEN telemetry is accepted, and HOW
docs describe the fail-open gate — yet nobody asked "who else inserts the
flag?" The result (CR4-1/D4-1) is the worst kind of integrity bug: the system
manufactures evidence (false escalate flags on page open) AND suppresses
evidence (flag rows refresh freshness, SEC4-2). For the owner's three declared
uses — recruiting, graded exams, contests — this is the difference between "we
flag unmonitored submissions" and "our flags are statistically meaningless".
It must be the cycle's top priority, and the fix must include red-first tests
for the NON-submission paths, not just the happy path.

## 2. Cycle-3's own change is implicated — the loop reviewed the diff but not the callers
`getEffectiveExamCloseAt` was wired into `validateAssignmentSubmission` with a
careful behavior-identical proof, while the same function's write side effect
went unexamined one screen below. Process lesson recorded for future cycles:
when a shared function is touched, enumerate its call sites and their
read/write expectations (the tracer lens now does this — keep it).

## 3. Don't over-rotate: the remaining findings are small
AGG4-3 (queue race) loses isolated telemetry rows in a narrow window; AGG4-4 is
an error-string nit; P4-1 is a monitoring-read cost with no incident behind it.
Fixing the two flag defects + docs is the cycle; resist refactoring the
monitor component wholesale (it is well-commented, tested, and stable).

## 4. Honesty checks on this cycle's review itself
- The persona/designer lenses cannot run a browser here (DEFER-ENV-GATES
  stands); their findings are static-analysis-grade and labeled as such.
- Coverage assertion "112 routes sampled" means auth-pattern sampling, not 112
  line-by-line reads; deep reads this cycle were the exam/anti-cheat surface
  (complete), submissions, snapshots, judge auth/sweep, realtime, validators.
- Nothing in this cycle re-verified the Rust workers (`judge-worker-rs`,
  `rate-limiter-rs`, `code-similarity-rs`) beyond cycle-1/2 coverage; no
  changes landed there since (git log confirms), so the carry is sound.

## 5. Deferred-register discipline
The cycle-3 register's four rows + CARRY block were re-read; none of their exit
criteria fire this cycle (no run_remote_build edit, no exam-page a11y pass, no
provisioned staging browser, no owner product decisions arrived). They must be
re-materialized verbatim in the cycle-4 plan — severities preserved.
