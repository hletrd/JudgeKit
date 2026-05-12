# Architect — Cycle 4 Architectural Review

## C4-ARCH-1: Incomplete raw query helper design

**File:** `src/lib/db/queries.ts:43-77`
**Severity:** MEDIUM | Confidence: High

The cycle 3 fix added a `client` parameter to `rawQueryOne`/`rawQueryAll` to make them transaction-aware, but the type (`typeof pool`) only accepts PostgreSQL Pool instances. Drizzle transaction clients are not Pools — they are database instances. This design does not solve the stated problem and may mislead future developers into thinking raw queries can participate in transactions.

**Recommendation:** Either:
1. Remove the `client` parameter and document that raw queries cannot participate in Drizzle transactions. Audit all call sites to ensure raw queries are moved outside transaction blocks.
2. Or redesign to accept Drizzle's `execute()` method or the underlying pg client from the transaction.

---

## C4-ARCH-2: Inconsistent error message convention

**Files:** `src/lib/assignments/exam-sessions.ts:53`, `src/lib/assignments/access-codes.ts:135`
**Severity:** LOW | Confidence: High

Both files throw generic `Error` messages (`"Failed to fetch DB server time..."`) while other errors in the same functions use localized string keys (`"assignmentNotFound"`, `"examModeInvalid"`, `"invalidAccessCode"`). This inconsistency means upstream error handlers cannot uniformly translate or categorize errors.

**Recommendation:** Standardize on localized error keys for all throw points in these functions.
