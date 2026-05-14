# Cycle 2 RPF Review Remediation Plan

> Date: 2026-05-14
> Source: `.context/reviews/_aggregate.md` (cycle 2)
> Status: Open — awaiting implementation

## Summary

This plan addresses 7 findings from the cycle 2 deep code review across correctness,
security, performance, test coverage, and process categories.

## Implementation Status

| ID | Status | Commit | Notes |
|----|--------|--------|-------|
| COR-3b | Open | — | Fix blockedUntil comparison in checkServerActionRateLimit |
| COR-5 | Open | — | Fix broken rawQueryOne/All transaction guard |
| SEC-7 | Open | — | Fix namedToPositional regex for escaped quotes |
| PERF-3 | Open | — | Fix verifyFileMagicBytes middle slice sizing |
| TEST-5 | Open | — | Add blockedUntil equality test for checkServerActionRateLimit |
| TEST-6 | Open | — | Fix transaction guard tests to not mask broken guard |
| POLICY-1 | Open | — | Note for future commits (no code change) |

---

## Phase 1: Correctness Fixes

### COR-3b: Fix blockedUntil comparison in checkServerActionRateLimit
**File:** `src/lib/security/api-rate-limit.ts`
**Severity:** Medium
**Description:** `checkServerActionRateLimit` at line 236 still uses `>` instead of `>=` for the `blockedUntil` comparison. The same bug was fixed in `atomicConsumeRateLimit` in cycle 1 (COR-3) but not propagated to `checkServerActionRateLimit`.
**Action:** Change `existing.blockedUntil > now` to `existing.blockedUntil >= now` at line 236.
**Exit criterion:** When `blockedUntil == now`, the request is correctly blocked.

### COR-5: Fix broken rawQueryOne/All transaction guard
**File:** `src/lib/db/index.ts`, `src/lib/db/queries.ts`
**Severity:** Medium
**Description:** `AsyncLocalStorage<void>()` with `run(undefined, ...)` means `getStore()` returns `undefined` both inside and outside transactions. The guard check `!== undefined` is always false.
**Action:**
1. Change `AsyncLocalStorage<void>` to `AsyncLocalStorage<boolean>` in `src/lib/db/index.ts:58`
2. Change `transactionContext.run(undefined, () => fn(tx))` to `transactionContext.run(true, () => fn(tx))` in `src/lib/db/index.ts:82`
3. Change `transactionContext.getStore() !== undefined` to `transactionContext.getStore() === true` in `src/lib/db/queries.ts:54` and `:84`
**Exit criterion:** Calling `rawQueryOne` inside `execTransaction` logs a warning; calling outside does not.

---

## Phase 2: Security Fix

### SEC-7: Fix namedToPositional regex for escaped quotes
**File:** `src/lib/db/queries.ts`
**Severity:** Medium
**Description:** The regex `('[^']*')|("[^"]*")|@([a-zA-Z_]\w*)` breaks on PostgreSQL escaped quotes (`''` inside a string literal), potentially exposing `@param` patterns inside literals.
**Action:** Replace the string literal regex with one that handles escaped quotes:
- Single quotes: `'(?:[^']|'')*'`
- Double quotes: `"(?:[^"]|"")*"`
**Exit criterion:** SQL query `WHERE name = 'it''s @email here' AND id = @id` correctly extracts only `@id`.

---

## Phase 3: Performance Fix

### PERF-3: Fix verifyFileMagicBytes middle slice sizing
**File:** `src/lib/files/validation.ts`
**Severity:** Low
**Description:** For files with length in range `(2*SLICE_SIZE, 3*SLICE_SIZE)`, the middle slice is clamped to a very small size (as small as 1 byte).
**Action:** Change the condition from `buffer.length > SLICE_SIZE * 2` to `buffer.length > SLICE_SIZE * 3` for adding the middle slice.
**Exit criterion:** Middle slice is always SLICE_SIZE bytes when added.

---

## Phase 4: Test Fixes

### TEST-5: Add blockedUntil equality test for checkServerActionRateLimit
**File:** `tests/unit/security/api-rate-limit.test.ts`
**Severity:** Medium
**Description:** No test covers the edge case where `blockedUntil == now`.
**Action:** Add a test that sets `blockedUntil: MOCK_DB_NOW_MS` and verifies the request is blocked.
**Exit criterion:** Test fails with `>` and passes with `>=`.

### TEST-6: Fix transaction guard tests
**File:** `tests/unit/db/query-helpers.test.ts`
**Severity:** Medium
**Description:** Tests mock `transactionContext.getStore` to return `undefined`, masking the broken guard.
**Action:**
1. Update the mock to return the correct sentinel value (`true` or `undefined`) based on context
2. Add a test that verifies the warning is logged when `rawQueryOne` is called inside a transaction
**Exit criterion:** Tests would fail if the guard is broken (i.e., if `getStore()` always returns the same value).

---

## Phase 5: Process Note

### POLICY-1: No Co-Authored-By in future commits
**Severity:** Low
**Description:** CLAUDE.md explicitly prohibits `Co-Authored-By` lines.
**Action:** Ensure all commits in this cycle omit Co-Authored-By lines.
**Exit criterion:** No Co-Authored-By lines in any new commits.

---

## Prior Cycle Deferred Items (unchanged)

The following items from cycle 1 remain deferred per existing plans and are NOT addressed in this cycle:

### COR-1: Judge claim problem lookup outside transaction
**Severity:** Medium
**Reason:** The atomic claim CTE is already transaction-safe. Moving problem lookup inside would require significant refactoring. The existing fallback handles the race.
**Exit criterion:** Revisit when refactoring the judge claim endpoint.

### PERF-1: Proxy auth cache eviction
**Severity:** Low
**Reason:** Lazy cleanup at 90% threshold is acceptable for the current load profile.
**Exit criterion:** Cache never exceeds max size + 10%.

### PERF-2: getStaleImages sequential batching
**Severity:** Low
**Reason:** Admin-only endpoint, called infrequently. pLimit(5) is sufficient.
**Exit criterion:** Revisit if admin page load times become problematic.

### ARCH-1: createApiHandler generic 500 error
**Severity:** Low
**Reason:** Intentional security design. Errors are logged server-side.
**Exit criterion:** Revisit when improving production observability.

### ARCH-2: Judge worker dual token system
**Severity:** Low
**Reason:** Both auth paths are well-documented and tested.
**Exit criterion:** Revisit during a judge worker auth refactor.
