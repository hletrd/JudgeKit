# RPF Cycle 8 — Performance Reviewer

**Date:** 2026-04-29
**HEAD reviewed:** `1c991812`
**Change surface vs cycle-7 close-out:** 0 commits, 0 files, 0 lines.

## Findings

**0 NEW.** Cycle 8 starts at HEAD = cycle-7 close-out (empty change surface). Re-validation of carry-forwards:

### AGG-2 — `Date.now()` in `src/lib/security/in-memory-rate-limit.ts` hot path

- HEAD lines 22, 24, 56, 75, 100, 149 still call `Date.now()`. Lines 41-47 still sort on overflow.
- Severity MEDIUM (preserved). Exit criterion: rate-limit-time perf cycle.
- Status: DEFERRED.

### ARCH-CARRY-2 — SSE O(n) eviction

- Two sites at HEAD:
  - `src/lib/realtime/realtime-coordination.ts` (legacy backplane).
  - `src/app/api/v1/submissions/[id]/events/route.ts:48-63` (per-submission SSE channel).
- Same O(n) sweep on every disconnect. Severity LOW. Exit criterion: SSE perf cycle OR > 500 concurrent connections.
- Status: DEFERRED.

### PERF-3 — Anti-cheat heartbeat gap query

- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:191-225` still computes per-participant gap detection in N+1 fashion under load.
- Severity MEDIUM. Exit criterion: anti-cheat dashboard p99 > 800ms OR > 50 concurrent contests viewed simultaneously.
- Status: DEFERRED.

### C2-AGG-5 — Visibility-aware polling helper extraction

- 5 distinct sites at HEAD (verified): `submission-list-auto-refresh.tsx`, `submissions/submission-detail-client.tsx`, `layout/active-timed-assignment-sidebar-panel.tsx`, `exam/anti-cheat-monitor.tsx`, `exam/countdown-timer.tsx`.
- Under 7-instance trigger. Helper extraction without active need is gold-plating.
- Severity LOW. Exit criterion: telemetry signal OR 7th instance.
- Status: DEFERRED unchanged.

### C2-AGG-6 — Practice page Path B

- `src/app/(public)/practice/page.tsx:417` still fetches all matching IDs.
- Severity LOW. Exit criterion: p99 > 1.5s OR > 5k matching problems.
- Status: DEFERRED.

## Test file perf review

`tests/unit/api/time-route-db-time.test.ts`: three `readFileSync` calls + three regex matches. ~5ms total. Negligible. No concerns.

## Recommendations

- Item C7-DB-2-upper-bound (operator footgun for `DEPLOY_SSH_RETRY_MAX`) is perf-adjacent and lightweight. Reasonable cycle-8 pick.
- C2-AGG-5 hook extraction: continue deferring until 7-instance trigger lands. The 5 sites at HEAD have subtly different polling cadences (submission list auto-refresh: 5s; countdown-timer: 1s with stale-tab compensation; anti-cheat: every 30s). A single helper would need 4-arg config or 4 callbacks; not obviously a win until the 7th distinct cadence appears.
- Recommend perf-pick cycle 8: **C7-DB-2-upper-bound** (operator clarity, deploy-script polish) + co-pick a non-perf LOW item.

## Confidence

H on no-new-findings; H on AGG-2/ARCH-CARRY-2/PERF-3 status; M on cycle-8 pick recommendation.
