# RPF Cycle 7 — test-engineer (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `45502305`.
**Cycle-7 change surface vs prior cycle close-out:** **0 commits, 0 files, 0 lines.**

## Summary

Empty change surface. Stale prior cycle-7 test-engineer findings re-validated:
- C7-TE-1 (no test for `/api/v1/time`): NOW VALUABLE because endpoint uses `getDbNowMs()` (post-AGG-1 fix). Recommended as a cycle-7 LOW draw-down pick.
- C7-TE-2 (participant-status time-boundary tests): unchanged; carry-forward.
- C7-TE-3 (vitest flaky timeouts): same as DEFER-ENV-GATES carry-forward.
- C7-TE-4 (candidate dashboard flaky): same as DEFER-ENV-GATES carry-forward.

## Stale prior cycle-7 test-engineer findings — re-validated at HEAD

### C7-TE-1 (no test for `/api/v1/time`) — UPGRADED VALUE, RECOMMEND IMPLEMENTING THIS CYCLE

Stale finding noted the time endpoint had no test. At HEAD, the endpoint:
```ts
import { getDbNowMs } from "@/lib/db-time";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ timestamp: await getDbNowMs() });
}
```

A test would verify:
1. Response shape: `{ timestamp: <number> }`.
2. Timestamp is a finite positive integer.
3. With `getDbNowMs` mocked to return a known value, the response includes that value.
4. With `getDbNowMs` mock throwing, the route propagates / handles gracefully.

**Effort estimate:** 30-50 lines including imports + setup. Confidence: H.
**Severity:** LOW (no current bug, just gap coverage).
**Recommended:** YES — small, targeted, retires C7-TE-1.

### C7-TE-2 (participant-status time-boundary tests) — DEFER

`src/lib/assignments/participant-status.ts` `hasActiveExamSession` and `getAssignmentParticipantStatus` accept a `now` parameter. Test gaps:
- Exam session exactly at deadline boundary
- `startedAt` in the future
- Invalid date string passed as `examSessionPersonalDeadline`

These are valid-but-not-urgent gaps. Severity: LOW. Defer with exit criterion: bug report on deadline boundary OR participant-status refactor cycle opens.

### C7-TE-3 (vitest flaky timeouts) — same as DEFER-ENV-GATES

Carry-forward. Same root cause as cycle-3..6: vitest worker pool fork-spawn errors + DB-env-required tests timing out under CPU contention. Not a cycle-7 regression.

### C7-TE-4 (candidate-dashboard timer-drift flaky) — same as DEFER-ENV-GATES

Carry-forward.

## Cycle-6 commits — test impact

- `72868cea` and `2791d9a3` are deploy-script changes. No `tests/` impact. No regression in any test suite from these commits (cycle-6 Task Z confirmed).

## NEW test-engineer findings this cycle

**0 NEW.** All stale cycle-7 findings either upgraded-and-recommended-for-implementation (C7-TE-1) or deferred with explicit exit criteria.

## Recommendations for cycle-7 PROMPT 2

1. **Implement C7-TE-1** — small targeted unit test for `/api/v1/time`. Effort ≤ 50 lines. Closes a clear coverage gap on a cycle-frequently-touched route.
2. **Defer C7-TE-2** with exit criterion: participant-status bug OR refactor cycle opens.
3. **Defer C7-TE-3 / C7-TE-4** under DEFER-ENV-GATES umbrella.

## Confidence

H.
