# Aggregate Review — Cycle 6

**Date:** 2026-05-12
**Scope:** Focused review of judge/claim, judge/poll, submissions, scoring, auth, exam sessions, recruiting, anti-cheat, and contest APIs
**Previous cycles reviewed:** C5 aggregate (all 3 findings were fixed in cycle 5)

---

## MEDIUM Severity

### C6-AGG-1: Missing leaderboard cache invalidation on mutations (carry-over from C5-AGG-4)

**File:** `src/lib/assignments/contest-scoring.ts:58` (cache definition)
**Also affected:** `src/app/api/v1/judge/poll/route.ts:133-181`, `src/app/api/v1/admin/submissions/rejudge/route.ts:46-63`
**Confidence:** High

The `rankingCache` LRU cache in `contest-scoring.ts` stores computed leaderboard results for 30 seconds. When submissions are judged (poll route) or bulk-rejudged (admin rejudge route), the cache is **never invalidated**. This means instructors viewing leaderboards during active contests see stale data for up to 30 seconds after a submission is judged.

**Concrete failure scenario:**
1. Student submits solution to problem A during an active ICPC contest
2. Worker judges it as "accepted" and updates the submission score
3. Instructor views the leaderboard within 30 seconds
4. The cached leaderboard still shows the old ranking (student not credited for the solve)
5. After cache TTL expires, the correct ranking appears

**Fix:** Add `invalidateRankingCache()` to `contest-scoring.ts` and call it from mutation paths.
**Status:** Fixed in commit defe5489.

---

## LOW Severity

### C6-AGG-2: Worker deregister doesn't atomically release submissions

**File:** `src/app/api/v1/judge/deregister/route.ts:53-103`
**Confidence:** High

The deregister route performed two separate DB operations: update worker to offline, then release claimed submissions. If submission release failed after the worker was marked offline, submissions remained claimed for up to the stale-claim timeout (5 minutes), causing unnecessary judging delays.

**Fix:** Wrap both operations in a single `execTransaction`.
**Status:** Fixed in commit 9dcd3ad0.

### C6-AGG-3: `getDbNowUncached` called inside transaction in resetRecruitingInvitationAccountPassword

**File:** `src/lib/assignments/recruiting-invitations.ts:404-435`
**Confidence:** Medium

Same pattern violation as C5-AGG-2. `getDbNowUncached()` queried the global pool via `rawQueryOne`, bypassing transaction isolation.

**Fix:** Move `getDbNowUncached()` before `db.transaction()`.
**Status:** Fixed in commit 309205dc.

---

## Deferred from previous cycles (retain)

| ID | File | Severity | Reason | Exit Criterion |
|---|---|---|---|---|
| DEFERRED-3-1 | `leaderboard.ts`, `contest-scoring.ts` | MEDIUM | Refactoring risk | Next scoring rule change |
| DEFERRED-3-2 | `participant-timeline.ts:163,175` | LOW | Theoretical | User report |
| DEFERRED-3-3 | `contest-scoring.ts:121-145` | LOW | Scale not reached | Performance bottleneck |
| DEFERRED-3-4 | `participant-timeline-logic.test.ts` | MEDIUM | Mock infra needed | Integration tests cover it |

---

## Verified Safe Patterns (new this cycle)

| Pattern | Location | Assessment |
|---|---|---|
| Exam session start idempotency | `exam-sessions.ts:64-99` | Correct |
| Judge claim CTE atomicity | `judge/claim/route.ts:175-234` | Correct |
| Poll route final transaction | `judge/poll/route.ts:138-181` | Correct |
| Rate limit atomic consume | `api-rate-limit.ts:80-137` | Correct |
| Anti-cheat shared heartbeat | `realtime-coordination.ts:152-203` | Correct |
| Recruiting token atomic claim | `recruiting-invitations.ts:690-706` | Correct |
| Compiler sandboxing | `compiler/execute.ts:323-519` | Correct |
| Shell command validation | `compiler/execute.ts:170-244` | Correct |
