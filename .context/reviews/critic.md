# Critic — RPF Cycle 9 (2026-06-13)

**HEAD:** da6179f3. Baseline green (2663 unit PASS).

## Theme
**Finish the deterministic-listing-order sweep.** Cycle-7 (commit 4cf6dfe0)
claimed "deterministic offset/cap listing order across 7 sibling routes" and
cycle-8 deferred the heartbeat-gap scan (AGG8-2) as a *bounded, non-paged* scan.
But the sweep's own class — **offset-paged listings ordered by a non-unique
column** — still has three live offenders this cycle missed:
1. `code-snapshots/[userId]/route.ts:54` (`asc(created_at)`) — anti-cheat
   evidence timeline, highest-signal because snapshots cluster in time;
2. `recruiting-invitations.ts:272` (`createdAt`) — recruiter candidate list;
3. `accepted-solutions/route.ts:54-59` (3 sort modes, none ending in a unique
   column) — public solution browser.

These are not new feature surface and not a manufactured finding: they are the
literal residue of an incomplete sweep, on routes that include an
academic-integrity evidence view the owner cares about. The fix is one
`id`-tiebreak append per route — mirrors the cycle-7 pattern exactly.

## Skepticism check
- Is CR9-1 a duplicate of the deferred AGG8-2? **No.** AGG8-2 is a *bounded
  non-paged* `limit(5000)` scan whose deferral rationale (heartbeats 60 s apart,
  time-based gap detection tolerant of a one-interval shift) is sound and
  unchanged. CR9-1 is a *user-paged offset listing* where same-ms collisions are
  likely and a dropped row is a missing evidence row. Different route, different
  mechanism, different severity. AGG8-2 stays deferred; CR9-1 is scheduled.
- Did I invent severity? No — MEDIUM, consistent with how cycle-7 rated the same
  class for the 7 routes it did fix.

## Convergence honesty
This is a genuine residual finding cluster, not busywork. Beyond it, the
token-lifecycle theme is converged and no other 17-lens pass surfaced a new
actionable defect this cycle.
