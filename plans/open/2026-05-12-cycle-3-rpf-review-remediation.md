# Cycle 3 RPF Review Remediation Plan

**Date:** 2026-05-12
**Source:** `.context/reviews/_aggregate.md` (cycle 3 review)
**User-injected TODOs:** `plans/user-injected/pending-next-cycle.md` TODO-1

---

## HIGH Priority (implement this cycle)

(none)

---

## MEDIUM Priority (implement this cycle)

### PLAN-3-1: Wrap `getParticipantTimeline` DB queries in transaction

**Finding:** C3-AGG-1 / TODO-1 (user-injected)
**File:** `src/lib/assignments/participant-timeline.ts:94-184`
**Severity:** MEDIUM | Confidence: High
**Cross-agent agreement:** 6/7 agents

**Problem:** The `getParticipantTimeline` function fires 8 parallel DB queries via `Promise.all` without a transaction wrapper. Each query reads from potentially changing database state, producing a non-point-in-time-consistent result set.

**Implementation:**
1. Change the function signature to wrap the body in `return db.transaction(async (tx) => { ... })`
2. Replace all 8 `db.query` / `db.select` calls with `tx.query` / `tx.select`
3. Verify the function still returns `ParticipantTimeline | null`
4. Run tests to ensure no regressions

**Status:** completed (commit b66e7f7e)

---

### PLAN-3-2: Make `rawQueryOne`/`rawQueryAll` transaction-aware

**Finding:** C3-AGG-2
**Files:** `src/lib/db/queries.ts:43-73`, `src/lib/assignments/exam-sessions.ts:52`
**Severity:** MEDIUM | Confidence: High
**Cross-agent agreement:** 5/7 agents

**Problem:** `rawQueryOne` and `rawQueryAll` always use the global `pool.query()`, bypassing any active transaction. In `exam-sessions.ts:52`, a `SELECT NOW()` query inside `db.transaction()` runs outside the transaction.

**Implementation:**
1. Add optional `client` parameter to `rawQueryOne` and `rawQueryAll`:
   ```typescript
   export async function rawQueryOne<T>(
     sql: string,
     params?: Record<string, unknown>,
     client?: Pick<typeof pool, "query">
   ): Promise<T | undefined>
   ```
2. Use `client ?? pool` for the actual query execution
3. Update `exam-sessions.ts:52` to pass `tx` (or `tx.$client` if using Drizzle transaction client) as the client parameter
4. Check for other callers of rawQueryOne/rawQueryAll inside transactions and update them

**Status:** completed (commit 320fa8b1)

---

### PLAN-3-3: Replace source-inspection tests with real unit tests

**Finding:** C3-AGG-3
**File:** `tests/unit/assignments/participant-timeline-logic.test.ts`
**Severity:** MEDIUM | Confidence: High
**Cross-agent agreement:** 4/7 agents

**Problem:** The test file reads source code and checks string presence. It never exercises actual function logic.

**Implementation:**
1. Create real unit tests with `vi.mock("@/lib/db")` to mock Drizzle
2. Test cases:
   - Returns null for non-existent participant
   - Basic timeline with submissions and snapshots
   - ICPC first-AC detection (status === "accepted")
   - IOI first-AC detection (score >= points)
   - Late penalty application
   - Anti-cheat aggregation
   - sortTimeline ordering with null timestamps
3. Keep or remove the source-inspection test (recommend removal)

**Status:** deferred — see DEFERRED-3-4

---

### PLAN-3-4: Deduplicate scoring logic between contest-scoring.ts and leaderboard.ts

**Finding:** C3-AGG-4
**Files:** `src/lib/assignments/leaderboard.ts:118-176`, `src/lib/assignments/contest-scoring.ts`
**Severity:** MEDIUM | Confidence: High
**Cross-agent agreement:** 2/7 agents

**Problem:** `computeSingleUserLiveRank` reimplements ICPC and IOI scoring CTEs.

**Implementation:**
Option A: Extract shared SQL CTE building blocks into a helper
Option B: Have `computeSingleUserLiveRank` call `computeContestRanking` and extract the single user's rank

**Status:** deferred — see DEFERRED-3-1

---

## LOW Priority (defer with exit criteria)

### DEFERRED-3-1: Duplicate scoring logic maintenance hazard

**Finding:** C3-AGG-4
**Severity:** MEDIUM | Confidence: High
**Reason:** Refactoring requires careful coordination between two complex raw SQL queries. Risk of introducing ranking bugs outweighs maintenance benefit in current cycle. The shared `buildIoiLatePenaltyCaseExpr` already covers the most complex shared logic.
**Exit criterion:** Next scoring rule change or bug fix that touches either query.

---

### DEFERRED-3-2: Silent data truncation in timeline queries

**Finding:** C3-AGG-5
**File:** `src/lib/assignments/participant-timeline.ts:163,175`
**Severity:** LOW | Confidence: High
**Reason:** 5000 submissions / 1000 snapshots exceeds realistic contest scenarios. Removing limits without pagination risks performance issues. No user reports of truncated data.
**Exit criterion:** User report of truncated data, or performance benchmarks show limits are unnecessary.

---

### DEFERRED-3-3: LRU cache background refresh concurrency

**Finding:** C3-AGG-6
**File:** `src/lib/assignments/contest-scoring.ts:121-145`
**Severity:** LOW | Confidence: Medium
**Reason:** Theoretical concern. 50 concurrent background queries is manageable for the current scale. The `_refreshingKeys` set already prevents per-key thundering herd.
**Exit criterion:** Performance monitoring shows cache refresh as a bottleneck.

---

### DEFERRED-3-4: Source-inspection tests need real unit test replacement

**Finding:** C3-AGG-3
**File:** `tests/unit/assignments/participant-timeline-logic.test.ts`
**Severity:** MEDIUM | Confidence: High
**Reason:** Requires significant mocking infrastructure for Drizzle ORM transaction client. The existing source-inspection tests were updated to reflect the transaction wrapper change but still don't exercise actual logic.
**Exit criterion:** Mock DB infrastructure available or integration test suite covers timeline logic.

---

## Quality Gates

Before marking this plan complete, run:
- `npx eslint .`
- `npx next build`
- `npx vitest run`
