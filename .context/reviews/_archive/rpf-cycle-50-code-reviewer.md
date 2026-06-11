# Cycle 50 — Code Reviewer

**Date:** 2026-04-23
**Base commit:** 6463cdda
**Reviewer:** code-reviewer

## Inventory of Reviewed Files

- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/lib/assignments/participant-status.ts` (full)
- `src/lib/assignments/recruiting-invitations.ts` (full)
- `src/lib/assignments/exam-sessions.ts` (full)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/lib/security/rate-limiter-client.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` (full)
- `src/app/api/v1/judge/claim/route.ts` (full)
- `src/proxy.ts` (full)
- `src/lib/data-retention.ts` (full)
- `src/components/exam/anti-cheat-monitor.tsx` (full)
- `src/app/(public)/practice/page.tsx` (partial)
- `src/app/(dashboard)/dashboard/contests/layout.tsx` (full)
- `src/lib/db-time.ts` (reference)

## Findings

### CR-1: Stale-while-revalidate cache pattern duplicated across contest-scoring and analytics route [LOW/MEDIUM] (carry-over)

**File:** `src/lib/assignments/contest-scoring.ts:96-130`, `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:53-84`

**Description:** The same stale-while-revalidate pattern (cache check, age computation, background refresh with cooldown, cache miss fill) is duplicated between the two files. The logic is identical: check cache, compute age, trigger background refresh if stale, return stale data, etc. A shared utility would reduce duplication and ensure bug fixes apply to both.

**Status:** Already deferred from prior cycles (ARCH-3). Pattern is stable and well-documented.

---

## Sweep Notes

No new findings this cycle. The ICPC tie-breaker fix from cycle 49 (commit 39dcd495) is verified in place at `contest-scoring.ts:357-358`. The `Date.now()` clock-skew migration is complete for all critical paths. No `Map.get()!`, `as any`, `innerHTML`, empty catch blocks in server code, or `eval` patterns found. The two `dangerouslySetInnerHTML` uses (`json-ld.tsx`, `problem-description.tsx`) are properly sanitized. All prior fixes from cycles 37-49 remain intact.
