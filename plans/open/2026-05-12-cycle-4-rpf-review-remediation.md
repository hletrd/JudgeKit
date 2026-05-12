# Cycle 4 RPF Review Remediation Plan

**Date:** 2026-05-12
**Source:** `.context/reviews/_aggregate.md` (cycle 4 review)

---

## MEDIUM Priority (implement this cycle)

### PLAN-4-1: Move `rawQueryOne` outside transaction in access-codes.ts

**Finding:** C4-AGG-1
**File:** `src/lib/assignments/access-codes.ts:133`
**Severity:** MEDIUM | Confidence: High
**Cross-agent agreement:** 4/6 agents

**Problem:** `rawQueryOne("SELECT NOW()")` is called inside `db.transaction` at line 108 but executes on the global pool, bypassing transaction isolation. Same pattern as C3-AGG-2 which was fixed in exam-sessions.ts but missed here.

**Implementation:**
1. Move the `rawQueryOne` call and its error handling to before the `db.transaction` block (before line 108)
2. Pass the `now` value into the transaction closure
3. Verify the deadline check at lines 138-140 still uses the same `now` value
4. Run tests to ensure no regressions

**Status:** completed

---

### PLAN-4-2: Fix `rawQueryOne`/`rawQueryAll` client parameter type

**Finding:** C4-AGG-2
**File:** `src/lib/db/queries.ts:46,70`
**Severity:** MEDIUM | Confidence: High
**Cross-agent agreement:** 5/6 agents

**Problem:** `client?: typeof pool` can only accept Pool instances, not Drizzle transaction clients. The parameter is unusable for its intended purpose.

**Implementation:**
1. Remove the `client` parameter from `rawQueryOne` and `rawQueryAll`
2. Update the JSDoc comments to explicitly state that raw queries always execute on the global pool and cannot participate in Drizzle transactions
3. Document the recommended pattern: move raw queries outside transaction blocks, or use Drizzle's `tx.execute()` for raw SQL inside transactions
4. Verify no call sites are passing the 3rd argument (none should be)

**Status:** completed

---

## LOW Priority (implement this cycle)

### PLAN-4-3: Fix indentation in participant-timeline.ts

**Finding:** C4-AGG-4
**File:** `src/lib/assignments/participant-timeline.ts:94-325`
**Severity:** LOW | Confidence: High

**Implementation:**
1. Indent lines 95-324 (the transaction body) by 2 additional spaces
2. Run eslint to verify formatting

**Status:** completed

---

### PLAN-4-4: Use getDbNowUncached consistently for DB time queries

**Finding:** C4-AGG-5
**Files:** `src/lib/assignments/exam-sessions.ts:51`, `src/lib/assignments/access-codes.ts:133`
**Severity:** LOW | Confidence: High

**Implementation:**
1. In `exam-sessions.ts`, import and use `getDbNowUncached()` instead of inline `rawQueryOne("SELECT NOW()")`
2. In `access-codes.ts`, use the already-imported `getDbNowUncached()` and move the call outside the transaction block
3. Remove unused `rawQueryOne` import from `access-codes.ts`
4. Update `access-codes.test.ts` to assert on `getDbNowUncached` instead of `rawQueryOne`

**Status:** completed

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
**Exit criterion:** Performance monitoring shows bottleneck.

### DEFERRED-3-4: Source-inspection tests need real unit test replacement
**Finding:** C3-AGG-3 / C4-AGG-3
**File:** `tests/unit/assignments/participant-timeline-logic.test.ts`
**Severity:** MEDIUM | Confidence: High
**Reason:** Requires significant mocking infrastructure.
**Exit criterion:** Mock DB infrastructure available.

---

## Quality Gates

Before marking this plan complete, run:
- `npx eslint .`
- `npx next build`
- `npx vitest run`
