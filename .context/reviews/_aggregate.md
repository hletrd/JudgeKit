# Aggregate Review — Cycle 3

**Date:** 2026-05-12
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, critic, verifier, test-engineer, architect

---

## HIGH Severity

(none this cycle)

---

## MEDIUM Severity

### C3-AGG-1: `getParticipantTimeline` lacks transaction isolation

**File:** `src/lib/assignments/participant-timeline.ts:94-184`
**Cross-agent agreement:** code-reviewer, security-reviewer, critic, verifier, test-engineer, architect (6/7)
**Confidence:** High

8 parallel DB queries read from related tables without a transaction wrapper. This means the result set is not point-in-time consistent. A concurrent submission between queries could produce an internally inconsistent timeline.

**Fix:** Wrap the `Promise.all` in `db.transaction(async (tx) => { ... })` and use `tx` instead of `db` for all queries.

---

### C3-AGG-2: `rawQueryOne`/`rawQueryAll` bypass transaction isolation

**File:** `src/lib/db/queries.ts:43-73`, `src/lib/assignments/exam-sessions.ts:52`
**Cross-agent agreement:** code-reviewer, security-reviewer, critic, verifier, architect (5/7)
**Confidence:** High

`rawQueryOne` and `rawQueryAll` always execute on the global `pool`, even when called inside a `db.transaction()` callback. In `exam-sessions.ts:52`, the `SELECT NOW()` query runs outside the transaction. Any future INSERT/UPDATE raw SQL inside transactions would silently bypass isolation.

**Fix:** Add an optional `client` parameter to `rawQueryOne`/`rawQueryAll`, defaulting to `pool`.

---

### C3-AGG-3: Source-inspection tests provide false confidence

**File:** `tests/unit/assignments/participant-timeline-logic.test.ts`
**Cross-agent agreement:** code-reviewer, critic, verifier, test-engineer (4/7)
**Confidence:** High

The test file reads source code as strings and checks substring presence. It never calls any actual function. This gives the appearance of test coverage without providing any confidence in correctness.

**Fix:** Replace with real unit tests that mock DB queries and exercise `getParticipantTimeline` with test data.

---

### C3-AGG-4: Duplicate scoring logic between contest-scoring.ts and leaderboard.ts

**File:** `src/lib/assignments/leaderboard.ts:118-176`, `src/lib/assignments/contest-scoring.ts`
**Cross-agent agreement:** code-reviewer, critic (2/7)
**Confidence:** High

`computeSingleUserLiveRank` reimplements ICPC and IOI scoring CTEs that mirror `computeContestRanking`. Maintenance risk: fixes in one place may not be applied to the other.

**Fix:** Extract shared SQL building blocks or have single-user rank call the full ranking function.

---

## LOW Severity

### C3-AGG-5: Silent data truncation in timeline queries

**File:** `src/lib/assignments/participant-timeline.ts:163,175`
**Cross-agent agreement:** code-reviewer (1/7)
**Confidence:** High

`.limit(5000)` on submissions and `.limit(1000)` on snapshots silently truncate data for high-activity participants.

**Fix:** Remove limits, add pagination, or return a truncation indicator.

---

### C3-AGG-6: LRU cache background refresh concurrency

**File:** `src/lib/assignments/contest-scoring.ts:121-145`
**Cross-agent agreement:** perf-reviewer (1/7)
**Confidence:** Medium

Stale-while-revalidate can trigger up to 50 concurrent background DB queries under high load.

**Fix:** Consider global concurrency limit or increased stale threshold.

---

## AGENT FAILURES

(none)
