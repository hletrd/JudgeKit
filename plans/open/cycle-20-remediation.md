# Cycle 20 Review Remediation Plan

**Created:** 2026-05-09
**Review Head:** e9ff5e04
**Findings Source:** `.context/reviews/_aggregate.md`

---

## Active Fixes

### C20-1: Map zod error messages to safe types in public signup [MEDIUM]

**File:** `src/lib/actions/public-signup.ts:73`

**Plan:**
- Remove the unsafe cast `as PublicSignupResult["error"]`.
- Add a helper function `mapZodIssueToSignupError(issue: ZodIssue): PublicSignupResult["error"]` that maps known zod issue paths/codes to the correct error type.
- Return `"createUserFailed"` as the fallback for any unrecognized issue.
- Update tests to cover the fallback behavior.

### C20-2: Distinguish JSON parse errors from validation errors in recruiting validate [LOW]

**File:** `src/app/api/v1/recruiting/validate/route.ts:23`

**Plan:**
- Replace `await req.json().catch(() => null)` with explicit try/catch.
- On JSON parse failure, return `{ error: "invalidJson" }` (status 400).
- On schema validation failure, keep returning `{ error: "invalidToken" }` (status 400).
- Add test for malformed JSON body.

### C20-3: Validate compiler time limit before AbortSignal.timeout [LOW]

**File:** `src/lib/compiler/execute.ts:545`

**Plan:**
- Before constructing `AbortSignal.timeout`, validate `timeLimitMs`:
  - `Number.isFinite(timeLimitMs) && timeLimitMs > 0`
- If invalid, fall back to a default (e.g., 5000ms) and log a warning.

### C20-4: Wrap stream reader in try/catch during backup export [LOW]

**File:** `src/lib/db/export-with-files.ts:133-138`

**Plan:**
- Wrap the `dbReader.read()` loop in a try/catch.
- On error, re-throw with a descriptive message like `"backupStreamReadFailed"`.
- Ensure the reader is released on error using `dbReader.releaseLock()`.

### C20-5: Add runtime validation to chat-widget plugin config [LOW]

**File:** `src/app/api/v1/plugins/chat-widget/chat/route.ts:196-209`

**Plan:**
- Define a zod schema for the plugin config shape.
- Validate `pluginState.config` against the schema before use.
- Return `"notConfigured"` (500) if validation fails.

---

## Deferred Items

None this cycle. All findings are scheduled for implementation.

---

## Gate Requirements

- `npx eslint .`: must pass (no errors, no warnings)
- `npx tsc --noEmit`: must pass
- `npx next build`: must pass
- `npx vitest run`: must pass
- `npx vitest run --config vitest.config.component.ts`: must pass
