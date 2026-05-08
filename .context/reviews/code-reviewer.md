# Code Review — Cycle 20

**Date:** 2026-05-09
**HEAD:** e9ff5e04
**Agent:** code-reviewer (manual)

---

## C20-1: [MEDIUM] Unsafe type assertion on zod error message in public signup

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/actions/public-signup.ts:73`
- **Summary:** The code casts `parsed.error.issues[0]?.message` directly to `PublicSignupResult["error"]` using a type assertion. This assumes every zod validation error message string exactly matches one of the 17 union literals in `PublicSignupResult["error"]`. If the `publicSignupSchema` is ever extended with a new validation rule (e.g., a custom refinement with a message like "passwordTooCommon"), the cast produces a runtime value that is not in the expected union. The client UI may not have a translation for this unexpected string, causing a broken user-facing error message.
- **Concrete failure:** Add a `z.refine()` to `publicSignupSchema` with message "passwordTooCommon". A user submits an invalid signup form. The server returns `{ error: "passwordTooCommon" }`. The client calls `t("signup.error.passwordTooCommon")` which does not exist in messages/en.json or messages/ko.json, showing the raw key or falling back to a generic message.
- **Fix:** Replace the cast with an explicit mapping function that translates zod issue paths/codes to known error types, with a safe fallback to `"createUserFailed"`.

## C20-2: [LOW] Silent JSON parse failure loses debugging information

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/recruiting/validate/route.ts:23`
- **Summary:** `await req.json().catch(() => null)` silently swallows JSON parse errors (truncated body, invalid UTF-8, malformed syntax). The subsequent `safeParse(null)` fails and returns `"invalidToken"`, which conflates three distinct failure modes: (1) malformed JSON, (2) missing body, and (3) invalid token structure. API consumers cannot distinguish between these.
- **Concrete failure:** A recruiting page frontend bug sends a truncated POST body due to a network interruption. The backend returns `"invalidToken"`. Developers waste time investigating token generation logic instead of realizing the request body was truncated.
- **Fix:** Separate JSON parsing from schema validation. Return `"invalidJson"` or `"invalidRequestBody"` for parse failures, and `"invalidToken"` only for schema validation failures.

## C20-3: [LOW] AbortSignal.timeout may receive NaN if compiler time limit is invalid

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/lib/compiler/execute.ts:545`
- **Summary:** `AbortSignal.timeout(Math.max(timeLimitMs * 4, 120_000))` constructs a timeout signal. If `timeLimitMs` is `NaN` (e.g., from a corrupted system setting or unexpected DB value), `Math.max(NaN, 120_000)` returns `NaN`. `AbortSignal.timeout(NaN)` behavior is implementation-defined and may throw a `RangeError` or behave unexpectedly.
- **Concrete failure:** An admin sets `compilerTimeLimitMs` to an invalid value (e.g., via direct DB manipulation). A student clicks "Run" in the compiler. The request crashes with an unhandled `RangeError` instead of falling back to local execution.
- **Fix:** Validate `timeLimitMs` with `Number.isFinite(timeLimitMs) && timeLimitMs > 0` before constructing the signal, with a sensible fallback (e.g., 5000ms).

## C20-4: [LOW] Unhandled stream reader errors in backup export

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/lib/db/export-with-files.ts:133-138`
- **Summary:** The `while(true)` loop reading from `dbReader.read()` has no try/catch around the read itself. If the underlying `streamDatabaseExport` ReadableStream encounters an internal error (e.g., DB connection drop mid-transaction), `dbReader.read()` throws. The exception propagates out of `streamBackupWithFiles`, causing the backup route to return a generic 500 instead of a more specific error.
- **Fix:** Wrap the reader loop in try/catch and re-throw with a descriptive message, or handle gracefully by aborting the ZIP generation.

---

## Deferred / No Findings

- All prior cycle fixes (RAF cleanup, timer leaks, AbortController separation, stable React keys) are holding correctly.
- No new logic bugs found in contest replay, recruiting invitations, or file upload components.
- No SQL injection risks (Drizzle ORM parameterized queries throughout).
- No new race conditions in SSE connection tracking beyond those already documented.
