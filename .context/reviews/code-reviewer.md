# Code Review — Cycle 5

**Reviewer:** code-reviewer
**Date:** 2026-05-12

---

## Finding 1: Race condition in judge claim problem-not-found path

**File:** `src/app/api/v1/judge/claim/route.ts:352-374`
**Severity:** HIGH
**Confidence:** High

When a claimed submission's problem is not found in the database, the code resets the submission to pending and decrements the worker's active_tasks. Both operations occur OUTSIDE any transaction:

```typescript
// Line 356-363: Reset submission outside transaction
await db.update(submissions)
  .set({ status: "pending", judgeWorkerId: null, judgeClaimToken: null, judgeClaimedAt: null })
  .where(eq(submissions.id, claimed.id));

// Line 367-370: Decrement worker active_tasks outside transaction
if (workerId) {
  await db.update(judgeWorkers)
    .set({ activeTasks: sql`${judgeWorkers.activeTasks} - 1` })
    .where(eq(judgeWorkers.id, workerId));
}
```

Between the atomic claim (via raw SQL CTE) and this reset, another worker could claim the same submission. This leads to:
1. Worker A claims submission S
2. Worker A finds problem missing
3. Worker B claims submission S (via stale claim or race)
4. Worker A resets S to pending AND decrements Worker A's active_tasks
5. Result: S may be double-claimed, and active_tasks accounting is wrong

**Fix:** Wrap the reset and worker decrement in a single transaction. Use the claim token to ensure only the claiming worker can reset.

---

## Finding 2: getDbNowUncached called inside execTransaction

**File:** `src/app/api/v1/submissions/route.ts:268-269`
**Severity:** MEDIUM
**Confidence:** High

Same pattern as C3-AGG-2 / C4-AGG-1 (fixed in access-codes.ts and exam-sessions.ts). The `getDbNowUncached()` call is inside `execTransaction` but always queries the global pool via `rawQueryOne`, bypassing transaction isolation:

```typescript
const txResult = await execTransaction(async (tx) => {
  const dbNow = await getDbNowUncached();  // Uses global pool, not tx
```

While the time is only used for rate-limit window calculation (not for writes), it is inconsistent with the documented pattern of moving raw queries outside transaction blocks.

**Fix:** Move `getDbNowUncached()` call before `execTransaction`, matching the pattern applied to access-codes.ts and exam-sessions.ts.

---

## Finding 3: Inconsistent schema validation for submittedAt

**File:** `src/app/api/v1/judge/claim/route.ts:52-61`
**Severity:** LOW
**Confidence:** Medium

The `claimedSubmissionRowSchema` validates `submittedAt` with a different pattern than `executionTimeMs`/`memoryUsedKb`/`score`/`judgedAt`:

- `executionTimeMs` etc. use `coerceNullableNumber` (union of null, string->Number, number)
- `submittedAt` uses a custom union with explicit Number.isNaN checks and throws on NaN

This inconsistency means `submittedAt` will throw a schema parse error on NaN while the other fields silently coerce to null. If PostgreSQL returns an unexpected string for submittedAt, the claim fails with a 422 instead of proceeding.

**Fix:** Use `coerceNullableNumber` for `submittedAt` as well, or document why submittedAt needs stricter validation.

---

## Finding 4: Missing cache invalidation on submission mutations

**File:** `src/lib/assignments/contest-scoring.ts:58`
**Severity:** LOW
**Confidence:** Medium

The LRU cache (`rankingCache`) caches contest rankings for 30s. When submissions are mutated (rejudged, poll updates status, etc.), the cache is not invalidated. Users may see stale leaderboard data for up to 30 seconds after a submission is rejudged or completes.

**Fix:** Add cache invalidation calls in `rejudge` and `poll` routes, or reduce cache TTL for active contests.

---

## Finding 5: Unused workerId in non-worker claim SQL

**File:** `src/app/api/v1/judge/claim/route.ts:255`
**Severity:** LOW
**Confidence:** High

In the non-worker claim path, the SQL sets `judge_worker_id = @workerId`, but `workerId` is null in this path. This is harmless but confusing — the column is set to null explicitly, which is the same as the default.

**Fix:** Document or simplify — this is intentional (clears any existing workerId) but could use a comment.
