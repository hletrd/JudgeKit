# Verifier — Cycle 3 Evidence-Based Correctness Review

## C3-VER-1: Confirmed — `getParticipantTimeline` has no transaction wrapper

**File:** `src/lib/assignments/participant-timeline.ts:94-184`
**Severity:** MEDIUM | Confidence: High

Evidence: Lines 94-184 show `const [participant, examSession, ...] = await Promise.all([db.query.users..., db.query.examSessions..., ...])`. There is no `db.transaction` wrapper around the Promise.all. Each query uses the global `db` instance directly.

This means the 8 queries are not guaranteed to see a consistent snapshot of the database.

**Fix:** Wrap in `db.transaction(async (tx) => { ... })` and use `tx.query...` / `tx.select...` for all queries.

---

## C3-VER-2: Confirmed — `rawQueryOne` ignores transaction context

**File:** `src/lib/db/queries.ts:43-51`, `src/lib/assignments/exam-sessions.ts:52`
**Severity:** MEDIUM | Confidence: High

Evidence: `rawQueryOne` always calls `pool.query(text, values)`. In `exam-sessions.ts:52`, this is called inside `db.transaction(async (tx) => { ... })` at line 26. The `tx` parameter is never passed to `rawQueryOne`, so the query runs on the global pool outside the transaction.

This is a verified correctness issue for any code path that expects raw SQL to participate in transaction isolation.

**Fix:** Add optional transaction client parameter to raw query helpers.

---

## C3-VER-3: Confirmed — source-inspection test does not exercise code

**File:** `tests/unit/assignments/participant-timeline-logic.test.ts`
**Severity:** MEDIUM | Confidence: High

Evidence: The file imports `readFileSync` and `join`, reads the source file as a string, and uses `expect(source).toContain(...)` for all assertions. No functions are imported or called. The test passes even if the functions contain logic bugs that don't change the substring presence.

**Fix:** Replace with real unit tests.
