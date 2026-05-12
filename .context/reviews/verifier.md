# Verifier — Cycle 4 Evidence-Based Correctness Review

## C4-VER-1: Confirmed — `rawQueryOne` inside transaction in access-codes.ts

**File:** `src/lib/assignments/access-codes.ts:108,133`
**Severity:** MEDIUM | Confidence: High

Evidence: Line 108 opens `db.transaction(async (tx) => {`. Inside the transaction callback, line 133 calls `rawQueryOne("SELECT NOW()::timestamptz AS now")` without passing `tx` or any client parameter. The `rawQueryOne` function (queries.ts:48) uses `client ?? pool`, and since no client is passed, it executes on the global `pool` outside the transaction.

This is the same verified issue as C3-VER-2, but in a different file that was not fixed.

**Fix:** Move the `rawQueryOne` call to before the transaction block.

---

## C4-VER-2: Confirmed — client parameter type mismatch

**File:** `src/lib/db/queries.ts:46`
**Severity:** MEDIUM | Confidence: High

Evidence: The parameter is declared as `client?: typeof pool`. The `pool` export (index.ts:50) is typed as `Pool | null`. A Drizzle transaction client (`tx`) has type `NodePgDatabase<AppSchema>` (or transaction-specific variant), which does not extend `Pool`. TypeScript will reject passing `tx` to `rawQueryOne`.

The cycle 3 fix added a parameter that cannot be used for its intended purpose.

**Fix:** Correct the type or remove the parameter.

---

## C4-VER-3: Confirmed — participant-timeline.ts indentation regression

**File:** `src/lib/assignments/participant-timeline.ts:94-325`
**Severity:** LOW | Confidence: High

Evidence: Line 94 is `return db.transaction(async (tx) => {` with indent 0. Lines 95-324 (the entire transaction body) are also at indent 0. The closing `});` is at line 324 with indent 0, and the function's closing `}` is at line 325 with indent 0.

The transaction wrapper body should be indented one level (2 spaces) relative to the function body.
