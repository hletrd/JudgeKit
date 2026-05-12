# Security Review — Cycle 5

**Reviewer:** security-reviewer
**Date:** 2026-05-12

---

## Finding 1: TOCTOU race in judge claim problem-not-found path

**File:** `src/app/api/v1/judge/claim/route.ts:352-374`
**Severity:** HIGH
**Confidence:** High
**Category:** Race Condition / State Inconsistency

After the atomic claim CTE acquires a submission, if the problem lookup fails (line 341-350), the code attempts to reset the submission and decrement the worker's active_tasks. These two operations are NOT wrapped in a transaction:

```typescript
await db.update(submissions).set({ status: "pending", ... }).where(eq(submissions.id, claimed.id));
if (workerId) {
  await db.update(judgeWorkers).set({ activeTasks: sql`${judgeWorkers.activeTasks} - 1` })
    .where(eq(judgeWorkers.id, workerId));
}
```

Attack scenario:
1. Worker A claims submission S (atomic CTE succeeds)
2. Worker A's process crashes or is slow after the claim
3. Worker B claims S via stale claim timeout (the CTE allows this when judge_claimed_at is stale)
4. Worker A finally runs the problem-not-found check and resets S + decrements Worker A's tasks
5. Worker B is now processing S but Worker A's task count is wrong

The active_tasks counter could go negative over time, causing the worker to accept more tasks than its concurrency limit.

**Fix:** Wrap the reset in a transaction that checks the claim token is still valid. Also decrement active_tasks only if the worker still owns the claim.

---

## Finding 2: Docker build path validation is solid

**File:** `src/lib/docker/client.ts:62-72`
**Severity:** N/A (positive finding)
**Confidence:** High

The `validateDockerfilePath` function correctly prevents path traversal:
- Requires prefix `docker/Dockerfile.judge-`
- Rejects `..` and path separators in the suffix
- Matches the Rust validator in judge-worker-rs

This is good defense-in-depth.

---

## Finding 3: CSRF check bypass for API key auth is correct

**File:** `src/lib/api/handler.ts:139-148`
**Severity:** N/A (positive finding)
**Confidence:** High

The CSRF check correctly skips for API key-authenticated requests (`isApiKeyAuth`), since API keys don't involve cookies and therefore aren't vulnerable to CSRF. This matches OWASP guidance.

---

## Finding 4: Judge auth correctly rejects unknown workers

**File:** `src/lib/judge/auth.ts:52-97`
**Severity:** N/A (positive finding)
**Confidence:** High

The `isJudgeAuthorizedForWorker` function correctly:
- Rejects unknown workers (no fallback to shared token)
- Rejects workers without secretTokenHash
- Uses timing-safe comparison (`safeTokenCompare`)
- Hashes tokens before comparison

This is a well-hardened auth path.

---

## Finding 5: No new injection vectors found

**Severity:** N/A
**Confidence:** High

Reviewed raw SQL usage:
- `src/lib/db/queries.ts`: Named parameters with validation (`@\w+`), no user-controlled SQL text
- `src/app/api/v1/judge/claim/route.ts`: Raw CTE with parameterized values only
- `src/lib/assignments/contest-scoring.ts`: Raw CTE with parameterized values only

All raw SQL uses parameterized queries. No SQL injection vulnerabilities identified.
