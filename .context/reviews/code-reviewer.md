# Code Reviewer — Cycle 4 Review

## C4-CR-1: `rawQueryOne` inside transaction in access-codes.ts bypasses isolation

**File:** `src/lib/assignments/access-codes.ts:133`
**Severity:** MEDIUM | Confidence: High

Inside `db.transaction` (line 108), `rawQueryOne("SELECT NOW()::timestamptz AS now")` executes on the global `pool`, not the transaction client. The comment at lines 131-132 explicitly states the intent is to use "DB server time within the transaction" but the code does not achieve this. This is the same pattern cycle 3 fixed in `exam-sessions.ts`, but `access-codes.ts` was missed.

**Fix:** Move the `rawQueryOne` call outside the transaction block (before line 108), matching the pattern used in `exam-sessions.ts` after the cycle 3 fix.

---

## C4-CR-2: `rawQueryOne`/`rawQueryAll` client parameter type is unusable with Drizzle transactions

**File:** `src/lib/db/queries.ts:46,70`
**Severity:** MEDIUM | Confidence: High

The `client?: typeof pool` parameter added in cycle 3 can only accept `Pool | null`. Inside a Drizzle `db.transaction(async (tx) => { ... })`, the `tx` object is a `TransactionClient` (a Drizzle database instance), which has a completely different type from `Pool`. No caller inside a transaction can pass `tx` to `rawQueryOne`/`rawQueryAll` without a type error. The parameter does not solve the stated problem of transaction-aware raw queries.

**Fix:** Either:
- Remove the unused `client` parameter and document that raw queries cannot participate in Drizzle transactions (callers must use Drizzle's `tx.execute()` or move raw queries outside transactions)
- Or change the type to accept both `Pool` and the Drizzle transaction's underlying pg client

---

## C4-CR-3: Indentation regression after transaction wrapper in participant-timeline.ts

**File:** `src/lib/assignments/participant-timeline.ts:94-325`
**Severity:** LOW | Confidence: High

The `db.transaction(async (tx) => {` wrapper added in cycle 3 does not indent its body. Lines 95-324 are at the same indentation level as the `return db.transaction` statement, making the control flow difficult to read.

**Fix:** Indent the entire transaction body one level (2 spaces) deeper.

---

## C4-CR-4: Source-inspection tests still masquerade as logic tests

**File:** `tests/unit/assignments/participant-timeline-logic.test.ts`
**Severity:** MEDIUM | Confidence: High

Same finding as cycle 3 (C3-AGG-3). The test file reads source code as strings and checks substring presence. It was updated to verify the transaction wrapper exists but still does not exercise any actual function logic. The file comment acknowledges this limitation.

**Fix:** Replace with real unit tests that mock the DB layer and call `getParticipantTimeline` with test data.
