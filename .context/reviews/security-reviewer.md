# Security Reviewer — Cycle 3 Review

## C3-SEC-1: No transaction isolation on multi-query reads

**File:** `src/lib/assignments/participant-timeline.ts:94-184`
**Severity:** MEDIUM | Confidence: High

Reading participant data across 8 tables without a transaction means the result set is not point-in-time consistent. An attacker (or concurrent legitimate user) submitting code between queries could cause the timeline to show inconsistent state. While not directly exploitable for privilege escalation, this violates the principle that audit/timeline data should be internally consistent.

**Fix:** Wrap in `db.transaction(async (tx) => { ... })`.

---

## C3-SEC-2: rawQueryOne bypasses transaction isolation

**File:** `src/lib/db/queries.ts:43-73`, `src/lib/assignments/exam-sessions.ts:52`
**Severity:** MEDIUM | Confidence: High

The `rawQueryOne`/`rawQueryAll` helpers always execute on the global pool, even when called inside a transaction callback. In `exam-sessions.ts`, the `SELECT NOW()` query inside `db.transaction()` actually runs outside the transaction. More critically, any future code that uses raw queries inside transactions for INSERT/UPDATE will silently bypass isolation.

**Fix:** Add a transaction-aware parameter to raw query helpers.

---

## C3-SEC-3: SQL injection in `namedToPositional` parameter validation

**File:** `src/lib/db/queries.ts:95-110`
**Severity:** LOW | Confidence: Medium

The `namedToPositional` function validates parameter names with `/^[a-zA-Z_]\w*$/` but the SQL replacement regex `@(\w+)` only matches word characters. The validation is slightly more permissive (allows leading underscore) than the regex, which is fine. However, there is no validation that replaced parameters don't appear inside SQL string literals or comments. If a caller accidentally constructs SQL like `SELECT * FROM users WHERE name = '@paramName'`, the replacement would corrupt the query.

**Fix:** This is a low-risk defense-in-depth issue. Document the constraint more prominently.
