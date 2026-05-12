# Security Review — Cycle 12 (HEAD: ecfa0b6c)

**Date:** 2026-05-11
**Reviewer:** security-reviewer
**Scope:** Auth, data validation, type safety boundaries

---

## Findings

### C12-SEC-1: Generic type parameter T in rate-limiter client allows unchecked passthrough
**Severity:** LOW | **Confidence:** High
**File:** `src/lib/security/rate-limiter-client.ts:83`

`callRateLimiter<T>` returns `(await response.json().catch(() => null)) as T | null`. The generic `T` is caller-defined (e.g., `RateLimitCheckResult`), but the actual parsed JSON is never validated against `T` before the cast. While downstream validators (`validate` callback) do check shape, the initial `as T | null` is a type-safety boundary violation.

**Risk:** If the `validate` callback has a bug or is omitted (line 165 `resetRateLimit` omits it), malformed data passes through.

**Fix:** Remove the `as T | null` cast. Return `unknown` and let the validator narrow the type.

---

### C12-SEC-2: import-transfer.ts JSON.parse as T trusts client input
**Severity:** LOW | **Confidence:** High
**File:** `src/lib/db/import-transfer.ts:67, 89`

`readJsonBodyWithLimit<T>` and `readUploadedJsonFileWithLimit<T>` parse request bodies and cast with `as T`. These are used for database import operations where malformed data could corrupt the database or crash the import process.

**Risk:** A crafted JSON payload that parses successfully but doesn't match `T` could cause type confusion and unexpected behavior in import logic.

**Fix:** Replace `as T` with Zod schema validation or runtime shape checking.

---

## Verified

- All cycle 11 security fixes remain intact (audit timestamp DB consistency, file sanitization, etc.).
- No new auth/authz bypasses found.
- No new injection vectors detected.
