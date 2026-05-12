# Security Reviewer — Cycle 4 Review

## C4-SR-1: Transaction isolation bypass in access code redemption

**File:** `src/lib/assignments/access-codes.ts:133`
**Severity:** MEDIUM | Confidence: High

Inside `redeemAccessCode`, the `rawQueryOne("SELECT NOW()")` at line 133 runs outside the transaction despite being inside a `db.transaction` block (line 108). The DB time is used for deadline validation (lines 138-140). If clock skew exists between the transaction's snapshot and the global pool query, a user could theoretically redeem an access code after the deadline has passed, because the NOW() value is not transaction-consistent with the assignment read at line 110.

**Fix:** Move the `rawQueryOne` call outside the transaction block, or use `tx.execute()` with Drizzle's raw SQL support.

---

## C4-SR-2: rawQueryOne/All client parameter type prevents proper transaction isolation

**File:** `src/lib/db/queries.ts:46,70`
**Severity:** MEDIUM | Confidence: High

The `client?: typeof pool` parameter cannot accept a Drizzle transaction client, meaning no raw query can ever participate in a transaction. This is a systemic limitation that forces developers to either (a) move raw queries outside transactions (losing atomicity) or (b) unknowingly run raw queries outside transactions while inside a transaction block (creating isolation violations). The latter is what happened in `access-codes.ts`.

**Fix:** Fix the type to accept Drizzle transaction clients, or explicitly document that raw queries bypass transactions and audit all call sites.
