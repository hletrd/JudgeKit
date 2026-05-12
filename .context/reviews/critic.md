# Critic — Cycle 4 Review

## C4-CT-1: Incomplete fix from cycle 3 — access-codes.ts missed

**File:** `src/lib/assignments/access-codes.ts:133`
**Severity:** MEDIUM | Confidence: High

Cycle 3 identified and fixed the same raw-query-outside-transaction issue in `exam-sessions.ts` (C3-AGG-2). However, the identical pattern in `access-codes.ts` was not discovered or fixed. This suggests the review process missed a file that should have been caught by the same analysis. The `grep` pattern `rawQueryOne.*NOW` would have found both occurrences.

**Fix:** Apply the same fix pattern (move raw query outside transaction) to `access-codes.ts`.

---

## C4-CT-2: Type-system mismatch in raw query helper

**File:** `src/lib/db/queries.ts:46,70`
**Severity:** MEDIUM | Confidence: High

Adding a parameter with a type that cannot be used as intended (`client?: typeof pool` when the caller has a Drizzle `TransactionClient`) is worse than not having the parameter. It creates the illusion of transaction support without providing it. Future developers may see the parameter and attempt to pass `tx`, only to hit a type error and work around it incorrectly.

**Fix:** Either make the parameter useful (correct type) or remove it and document the limitation clearly.

---

## C4-CT-3: False confidence from source-inspection tests

**File:** `tests/unit/assignments/participant-timeline-logic.test.ts`
**Severity:** MEDIUM | Confidence: High

The test file was updated in cycle 3 to verify the transaction wrapper exists, but this is still source-inspection testing. It provides zero confidence that `getParticipantTimeline` produces correct output. The cycle 3 deferral rationale ("requires significant mocking infrastructure") is reasonable, but the file should not remain in the test suite indefinitely in its current form.

**Fix:** Create a tracking issue or plan item with a concrete deadline for replacing these tests.
