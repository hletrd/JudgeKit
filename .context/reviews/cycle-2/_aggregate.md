# Cycle 2 — Aggregate Review Findings

> Generated: 2026-05-14
> Reviewer: single-pass comprehensive review (no registered subagents available)
> Files examined: 599 source files, 436 test files, 3 Rust crates
> Prior cycle: Cycle 1 findings were reviewed for completeness of remediation

---

## Table of Contents

1. [Correctness](#correctness)
2. [Security](#security)
3. [Performance](#performance)
4. [Test Coverage](#test-coverage)
5. [Process / Policy](#process--policy)
6. [Deferred Findings Summary](#deferred-findings-summary)

---

## Correctness

### COR-3b: `checkServerActionRateLimit` blockedUntil comparison still uses `>` instead of `>=`
**Severity:** Medium
**Confidence:** High
**File:** `src/lib/security/api-rate-limit.ts:236`

The COR-3 fix in cycle 1 changed `atomicConsumeRateLimit` to use `>=` for the `blockedUntil` comparison, but `checkServerActionRateLimit` (lines 217-285) was NOT updated. It still uses `>` at line 236:

```typescript
if (existing?.blockedUntil && existing.blockedUntil > now) {
```

**Failure scenario:** If `windowMs` is misconfigured to 0, `blockedUntil` is set to `now + 0 = now` when the limit is hit. The `>` check means a `blockedUntil` equal to `now` passes through (not blocked), allowing immediate retry. This is the exact same bug that COR-3 fixed for `atomicConsumeRateLimit`.

This function is called by ALL server actions (language configs, tag management, user management, plugins, public signup) — the impact is broad.

**Fix:** Change `existing.blockedUntil > now` to `existing.blockedUntil >= now` at line 236.

**Citations:**
- `src/lib/security/api-rate-limit.ts:236` — `existing.blockedUntil > now`
- `src/lib/security/api-rate-limit.ts:96` — the fixed version in `atomicConsumeRateLimit` uses `>=`

---

### COR-5: `rawQueryOne`/`rawQueryAll` transaction guard is broken
**Severity:** Medium
**Confidence:** High
**File:** `src/lib/db/index.ts:58`, `src/lib/db/queries.ts:54-55`

The transaction guard added in cycle 1 (commit `68041129`) uses `AsyncLocalStorage<void>()` with `transactionContext.run(undefined, () => fn(tx))`. Because the store type is `void` (i.e., `undefined`), `getStore()` returns `undefined` both inside a transaction (because the store value IS `undefined`) and outside a transaction (because no store is active, which also returns `undefined`).

The guard check in `rawQueryOne` and `rawQueryAll`:
```typescript
if (transactionContext.getStore() !== undefined) {
```

is ALWAYS `false`, meaning the warning NEVER fires regardless of whether the call is inside or outside a transaction.

**Failure scenario:** A developer calls `rawQueryOne` inside an `execTransaction` callback, expecting it to participate in the transaction. The function silently runs on the global pool instead, but the guard that was supposed to warn about this never fires.

**Fix:** Change `AsyncLocalStorage<void>` to `AsyncLocalStorage<boolean>` (or `symbol`), use `transactionContext.run(true, () => fn(tx))`, and check `transactionContext.getStore() === true`.

**Citations:**
- `src/lib/db/index.ts:58` — `new AsyncLocalStorage<void>()`
- `src/lib/db/index.ts:82` — `transactionContext.run(undefined, () => fn(tx))`
- `src/lib/db/queries.ts:54-55` — broken guard check
- `src/lib/db/queries.ts:84-85` — same broken guard in `rawQueryAll`

---

## Security

### SEC-7: `namedToPositional` regex does not handle escaped quotes in PostgreSQL string literals
**Severity:** Medium
**Confidence:** High
**File:** `src/lib/db/queries.ts:119-120`

The regex `('[^']*')|("[^"]*")|@([a-zA-Z_]\w*)` does not handle PostgreSQL's escape convention for string literals: a single quote inside a string literal is escaped by doubling it (`''`).

Example SQL:
```sql
SELECT * FROM users WHERE name = 'it''s @email here' AND id = @id
```

The regex matches:
1. `'it'` — string literal (passes through)
2. `''` — string literal (passes through)
3. `s @email here'` — NOT a string literal, `@email` is matched as a parameter

**Failure scenario:** A SQL query with an escaped quote followed by `@param` inside the same literal would incorrectly extract the parameter. If `email` is not in the params object, it throws "Missing SQL parameter: email". If `email` IS in the params, it would be incorrectly substituted.

**Fix:** Replace the string literal regex with one that handles escaped quotes:
```
'(?:[^']|'')*'
```
(For single quotes; equivalent for double quotes.)

**Citations:**
- `src/lib/db/queries.ts:119-120` — current regex
- `src/lib/db/queries.ts:105-140` — `namedToPositional` implementation

---

## Performance

### PERF-3: `verifyFileMagicBytes` middle slice is too small for files just over 2*SLICE_SIZE
**Severity:** Low
**Confidence:** High
**File:** `src/lib/files/validation.ts:176-186`

For text files, `verifyFileMagicBytes` samples three regions (start, middle, end). The middle slice is added when `buffer.length > SLICE_SIZE * 2`. However, the slice bounds are clamped:

```typescript
slices.push(buffer.subarray(
  Math.max(SLICE_SIZE, midStart),
  Math.min(buffer.length - SLICE_SIZE, midStart + SLICE_SIZE)
));
```

For a file of length 16385 (just over 2*8192=16384):
- `midStart = 8192 - 4096 = 4096`
- start = `max(8192, 4096) = 8192`
- end = `min(8193, 12288) = 8193`
- slice = `[8192, 8193)` = **1 byte**

The middle slice becomes vanishingly small for files in the range `(2*SLICE_SIZE, 3*SLICE_SIZE)`, defeating the purpose of multi-region sampling.

**Fix:** Only add the middle slice when `buffer.length > SLICE_SIZE * 3`, or adjust the clamping logic.

**Citations:**
- `src/lib/files/validation.ts:181-183` — middle slice calculation

---

## Test Coverage

### TEST-5: No test for `checkServerActionRateLimit` blockedUntil equality edge case
**Severity:** Medium
**Confidence:** High
**File:** `tests/unit/security/api-rate-limit.test.ts`

The test suite for `checkServerActionRateLimit` (lines 267-367) covers:
- No existing row
- Existing row within window, under limit
- At max attempts
- Window expired
- Insert vs update paths

But there is NO test for the edge case where `blockedUntil == now` (e.g., when `windowMs=0` or the block has just expired). The COR-3b bug would not be caught by the current tests.

**Fix:** Add a test that sets `blockedUntil: MOCK_DB_NOW_MS` and verifies the request is correctly blocked (with `>=`) or allowed (with `>`).

**Citations:**
- `tests/unit/security/api-rate-limit.test.ts:267-367` — `checkServerActionRateLimit` tests

---

### TEST-6: `query-helpers.test.ts` mocks mask the broken transaction guard
**Severity:** Medium
**Confidence:** High
**File:** `tests/unit/db/query-helpers.test.ts`

The tests mock `transactionContext.getStore` to always return `undefined`:
```typescript
transactionContext: { getStore: () => undefined }
```

This is the same value that the real broken guard returns both inside and outside transactions, so the tests pass even though the guard is broken. A correct test would verify that:
1. Outside a transaction, `getStore()` returns something falsy (e.g., `undefined`)
2. Inside a transaction, `getStore()` returns the sentinel value (e.g., `true`)
3. When inside a transaction, `rawQueryOne` logs a warning

**Fix:** Remove the mock for `transactionContext` and test the real behavior, or mock it to return the sentinel value for the "inside transaction" test case and verify the warning is logged.

**Citations:**
- `tests/unit/db/query-helpers.test.ts:35` — mock returning `undefined`
- `src/lib/db/queries.ts:54-55` — guard that should fire

---

## Process / Policy

### POLICY-1: Commits contain `Co-Authored-By: Claude Opus 4.7`
**Severity:** Low
**Confidence:** High
**File:** Git commit history (commits `bac4bd78`, `16cc47e0`, `1edff085`, `d441d3fb`, `54beee5e`)

The CLAUDE.md Git Commit Rules explicitly state:
> "Do NOT add `Co-Authored-By` lines to commit messages. Never attribute Claude as author or co-author in any commit."

Multiple recent commits in this repository contain `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

**Fix:** Do not add Co-Authored-By lines in future commits. (Do not rewrite published history.)

**Citations:**
- `CLAUDE.md` — Git Commit Rules section
- `git log --grep="Co-Authored-By: Claude"` — offending commits

---

## Deferred Findings Summary

None of the new findings above are deferred. All are actionable within this cycle.

The following items from prior cycles remain deferred per existing plans:
- COR-1: Judge claim problem lookup outside transaction (deferred in cycle 1)
- PERF-1: Proxy auth cache eviction (deferred in cycle 1)
- PERF-2: getStaleImages sequential batching (deferred in cycle 1)
- ARCH-1: createApiHandler generic 500 error (deferred in cycle 1)
- ARCH-2: Judge worker dual token system (deferred in cycle 1)
