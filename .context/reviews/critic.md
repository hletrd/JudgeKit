# Critic Review — Cycle 5

**Reviewer:** critic
**Date:** 2026-05-12

---

## Finding 1: The judge claim problem-not-found path is a real bug

**File:** `src/app/api/v1/judge/claim/route.ts:341-374`
**Severity:** HIGH
**Confidence:** High

This is the most serious finding this cycle. The problem-not-found path in the judge claim route:
1. Fetches the problem AFTER the atomic claim
2. If missing, resets the submission and decrements active_tasks NON-ATOMICALLY
3. No claim token check during reset — any request could trigger the reset

While the endpoint is IP-restricted and auth-required, the race condition within the legitimate worker flow is real. A slow worker or concurrent stale claim can produce inconsistent state.

The fix is straightforward: wrap lines 356-370 in `execTransaction` and check the claim token matches.

---

## Finding 2: getDbNowUncached inside execTransaction is a pattern violation

**File:** `src/app/api/v1/submissions/route.ts:265-270`
**Severity:** MEDIUM
**Confidence:** High

The cycles 3/4 fixes explicitly moved `getDbNowUncached` (via `rawQueryOne`) outside transaction blocks because raw queries bypass transaction isolation. The submissions POST route violates this pattern:

```typescript
const txResult = await execTransaction(async (tx) => {
  const dbNow = await getDbNowUncached(); // Always uses global pool!
```

While the impact is lower here (dbNow is only used for rate-limit window, not for writes), it's a pattern inconsistency that future maintainers might copy into more sensitive code.

---

## Finding 3: Cache invalidation remains unaddressed

**File:** `src/lib/assignments/contest-scoring.ts`
**Severity:** LOW
**Confidence:** Medium

The leaderboard cache (30s TTL, 15s stale-while-revalidate) means:
- A participant submits code
- The submission completes judging
- The leaderboard may not reflect the new result for 15-30 seconds

For a live contest, this is a noticeable UX issue. The cache is necessary for performance (raw SQL CTEs are expensive), but invalidation should be tied to submission lifecycle events.

---

## Summary

Cycle 5 found fewer new issues than prior cycles, which is expected — the codebase has been through 4 review cycles. The remaining issues are:
1. One real race condition (HIGH)
2. One pattern inconsistency (MEDIUM)
3. A few deferred low-severity items

The codebase is in significantly better shape than cycle 1.
