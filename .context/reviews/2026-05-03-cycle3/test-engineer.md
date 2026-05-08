# Test Engineer Review — Cycle 3 (2026-05-03)

**HEAD reviewed:** `ae528d9b`

---

## C3-TE-1 (MEDIUM, HIGH) — No tests for `incrementFailedRedeemAttempt` concurrency behavior

**File:** `src/lib/assignments/recruiting-invitations.ts:34-55`

The `incrementFailedRedeemAttempt` function was added in cycle 2 (commit `31aca8eb`) but has no test coverage. Specifically:
- No test for the race condition (concurrent calls for the same token).
- No test for the error-swallowing catch block.
- No test verifying the counter actually increments correctly.

The cycle 2 test (`tests/unit/audit/events.test.ts`) only tested the `droppedEvents` field addition, not the recruiting counter.

**Fix:** Add integration tests that:
1. Verify the counter increments correctly for sequential calls.
2. Verify the counter reaches `MAX_FAILED_REDEEM_ATTEMPTS` and triggers lockout.
3. (If atomic SQL fix is applied) Verify atomicity under concurrent calls.

---

## C3-TE-2 (LOW, HIGH) — No test for initial redeem path missing `incrementFailedRedeemAttempt`

**File:** `src/lib/assignments/recruiting-invitations.ts:512-519`

The initial redeem path does not increment the counter on password validation failure (C3-SEC-2). There is no test that would catch this gap because:
1. There are no tests for `redeemRecruitingToken` at all (carry-forward C2-F14).
2. Even if tests existed, they would likely test the "happy path" and the "wrong password" re-entry path, not the initial redeem password validation failure path.

**Fix:** Add tests for `redeemRecruitingToken` covering both the initial and re-entry paths, including the counter increment behavior.

---

## C3-TE-3 (LOW, MEDIUM) — Magic-byte verification tests do not cover `text/` MIME types with null bytes

**File:** `tests/unit/files/magic-byte-verification.test.ts`

The magic-byte verification was added in cycle 1 (commit `10a16eff`) and updated in cycle 2 (commit `a4df76dd`). The existing tests likely cover the default-reject case, but the `text/` path (null-byte check) should have explicit test cases:
- Text file with null byte in first 8KB → rejected
- Text file with null byte after first 8KB → accepted
- Empty text file → accepted

**Fix:** Add test cases for the text-type null-byte verification path.

---

## C3-TE-4 (INFO, LOW) — 24 pre-existing test failures (carry-forward)

No investigation of the 24 pre-existing test failures this cycle. They remain deferred per DEFER-ENV-GATES.
