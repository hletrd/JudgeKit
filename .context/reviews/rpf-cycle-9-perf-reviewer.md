# RPF Cycle 9 — Performance Reviewer

**Date:** 2026-04-29
**HEAD reviewed:** `1bcdd485`.
**Change surface:** README+deploy-docker.sh+2 rate-limit JSDoc headers; no runtime hot-path code touched in cycle 8.

## Hot-path inventory checked at HEAD `1bcdd485`

- `src/lib/security/in-memory-rate-limit.ts` — Map + interval eviction, O(1) per request, 6× `Date.now()` calls per check (lines 22, 24, 56, 75, 100, 149). **No change** from cycle 8 (only doc header added). AGG-2 carry-forward.
- `src/lib/security/api-rate-limit.ts` — DB-backed via `getDbNowMs` / `getDbNowUncached` + sidecar fast-path. **No change** (only doc header added).
- `src/app/api/v1/submissions/[id]/events/route.ts:48-63` — SSE eviction (ARCH-CARRY-2). **No change**.
- `src/lib/realtime/realtime-coordination.ts` — SSE eviction. **No change**.
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:191-225` — heartbeat gap query (PERF-3). **No change**.
- `src/app/(public)/practice/page.tsx:417` — practice page Path B in-memory fetch all matching IDs (C2-AGG-6). **No change**.
- 5 polling sites (`submission-list-auto-refresh.tsx`, etc.) — visibility-aware polling helper extraction candidate (C2-AGG-5). **No change**.

## Findings

**0 NEW HIGH / MEDIUM / LOW.**

Cycle-8's diff has no runtime perf impact:
- README.md is a build-time static asset.
- `deploy-docker.sh` cap path runs *once* during deploy pre-flight; the +1 integer comparison is negligible vs the SSH connection cost it gates.
- The 2 JSDoc headers in rate-limit modules are stripped at compile time.

## Carry-forward perf items

| ID | Severity | Status at HEAD | Notes |
|---|---|---|---|
| AGG-2 | MEDIUM | unchanged | `Date.now()` × 6 per check + lines 41-47 overflow sort. Exit: rate-limit-time perf cycle. |
| C2-AGG-6 | LOW | unchanged | Practice page Path B. Exit: p99>1.5s OR >5k matching problems. |
| C2-AGG-5 | LOW | unchanged | 5 polling sites. Exit: telemetry signal OR 7th instance. |
| ARCH-CARRY-2 | LOW | unchanged | SSE eviction O(n) at 2 sites. Exit: SSE perf cycle OR >500 concurrent connections. |
| PERF-3 | MEDIUM | unchanged | Anti-cheat heartbeat gap query. Exit: dashboard p99>800ms OR >50 concurrent contests. |

No new perf hot paths introduced. No regression in measured perf characteristics. No change to perf-relevant code.

## Confidence

High on "0 NEW perf findings." The cycle-8 diff is documentation + a single integer comparison in deploy pre-flight; no perf-sensitive code modified.

## Recommendation

No perf items to schedule for cycle 9. Carry-forward items remain DEFERRED with their original exit criteria.
