# Perf Reviewer — Cycle 9 (RPF)

**Date:** 2026-05-29 · **HEAD:** 24939e42 (main)

## Scope
Email send path + the cycle-8 live-rank query restructure (cost neutrality).

## Findings
- **Live-rank query** (`leaderboard.ts:218-248`): the new two-level CTE
  (`per_problem` MAX group-by then per-user SUM) is the same shape the full board
  already runs; it scans the same `submissions ⨝ assignment_problems` set once.
  No extra round-trips; cost-neutral vs the old single-level SUM. Confirmed.
- **SMTP transporter**: pooled (`pool: true`, maxConnections 3, maxMessages 100),
  memoized across sends; rebuilt only on config change or transient-retry. Good.
- **notifySiteEvent** (`index.ts:359-365`): sends sequentially in a `for` loop
  over recipients (awaits each). For a large recipient list this serializes
  N sends. Site-event notifications go to a small operator set, so N is tiny —
  no perf concern at current scale. NOT a finding (no signal).

## Carried deferred perf items (unchanged preconditions → re-defer)
AGG-2 (rate-limit Date.now hot path), PERF-3 (anti-cheat dashboard p99),
ARCH-CARRY-2 (SSE O(n) eviction), D1/D2 (auth per-request DB). No new perf signal.

## Verdict
No net-new perf finding.
