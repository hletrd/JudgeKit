# Cycle 5 RPF Review Remediation Plan

**Date:** 2026-05-12
**Source:** `.context/reviews/_aggregate.md` (cycle 5 review)

---

## HIGH Priority (implement this cycle)

### PLAN-5-1: Fix race condition in judge claim problem-not-found path

**Finding:** C5-AGG-1
**File:** `src/app/api/v1/judge/claim/route.ts:352-374`
**Severity:** HIGH | Confidence: High
**Cross-agent agreement:** 5/7 agents

**Problem:** When a claimed submission's problem is not found, the reset to pending and worker active_tasks decrement happen outside any transaction. Another worker could claim the submission in between, leading to inconsistent state and potential negative active_tasks.

**Implementation:**
1. Wrap the submission reset (lines 356-363) and worker decrement (lines 367-370) in `execTransaction`
2. Inside the transaction, verify the claim token still matches the submission's current `judgeClaimToken`
3. Only decrement `active_tasks` if the worker still owns the claim
4. Add a test for this edge case
5. Run eslint, next build, vitest

**Status:** completed (commit d576493e)

---

## MEDIUM Priority (implement this cycle)

### PLAN-5-2: Move getDbNowUncached outside execTransaction in submissions POST

**Finding:** C5-AGG-2
**File:** `src/app/api/v1/submissions/route.ts:268-269`
**Severity:** MEDIUM | Confidence: High
**Cross-agent agreement:** 3/7 agents

**Problem:** `getDbNowUncached()` is called inside `execTransaction` but always queries the global pool, bypassing transaction isolation. Same pattern as C3-AGG-2 / C4-AGG-1 (fixed in exam-sessions.ts and access-codes.ts).

**Implementation:**
1. Move `const dbNow = await getDbNowUncached();` to before `execTransaction` (before line 265)
2. Pass `dbNow` into the transaction closure
3. Remove the now-unnecessary `getDbNowUncached` call from inside the transaction
4. Update `oneMinuteAgo` calculation to use the pre-fetched `dbNow`
5. Verify the exam session expiry check (line 320) still works with the same `dbNow`
6. Run eslint, next build, vitest

**Status:** completed (commit eff5a64d)

---

## LOW Priority (implement this cycle)

### PLAN-5-3: Use coerceNullableNumber for submittedAt in claimedSubmissionRowSchema

**Finding:** C5-AGG-3
**File:** `src/app/api/v1/judge/claim/route.ts:52-61`
**Severity:** LOW | Confidence: Medium

**Problem:** `submittedAt` uses custom validation while other numeric fields use `coerceNullableNumber`. Inconsistent behavior on NaN/unexpected strings.

**Implementation:**
1. Replace the custom `submittedAt` validation with `coerceNullableNumber`
2. Run tests to ensure no regressions in judge claim parsing

**Status:** no-fix — `submittedAt` is a required field (always set at insert time) while `executionTimeMs`/`memoryUsedKb`/`score`/`judgedAt` are nullable fields populated after judging. Using `coerceNullableNumber` would incorrectly allow null for a required field. The stricter validation is intentional and correct.

---

## Deferred from previous cycles (retain)

### DEFERRED-3-1: Duplicate scoring logic maintenance hazard
**Finding:** C3-AGG-4
**Files:** `src/lib/assignments/leaderboard.ts`, `src/lib/assignments/contest-scoring.ts`
**Severity:** MEDIUM | Confidence: High
**Reason:** Refactoring requires careful coordination. Risk of introducing ranking bugs.
**Exit criterion:** Next scoring rule change or bug fix.

### DEFERRED-3-2: Silent data truncation in timeline queries
**Finding:** C3-AGG-5
**File:** `src/lib/assignments/participant-timeline.ts:163,175`
**Severity:** LOW | Confidence: High
**Exit criterion:** User report of truncated data.

### DEFERRED-3-3: LRU cache background refresh concurrency
**Finding:** C3-AGG-6
**File:** `src/lib/assignments/contest-scoring.ts:121-145`
**Severity:** LOW | Confidence: Medium
**Reason:** Theoretical concern. 50 concurrent background queries is manageable for current scale.
**Exit criterion:** Performance monitoring shows cache refresh as a bottleneck.

### DEFERRED-3-4: Source-inspection tests need real unit test replacement
**Finding:** C3-AGG-3 / C4-AGG-3 / C5-AGG-5
**File:** `tests/unit/assignments/participant-timeline-logic.test.ts`
**Severity:** MEDIUM | Confidence: High
**Reason:** Requires significant mocking infrastructure for Drizzle ORM transaction client.
**Exit criterion:** Mock DB infrastructure available or integration test suite covers timeline logic.

### DEFERRED-C5-1: Missing leaderboard cache invalidation on mutations
**Finding:** C5-AGG-4
**File:** `src/lib/assignments/contest-scoring.ts:58`
**Severity:** LOW | Confidence: Medium
**Reason:** Cache invalidation requires careful coordination across multiple mutation paths (rejudge, poll, submission creation). The 15-30s stale window is acceptable for current use cases.
**Exit criterion:** User report of stale leaderboard data during active contests.

---

## Quality Gates

Before marking this plan complete, run:
- `npx eslint .`
- `npx next build`
- `npx vitest run`
