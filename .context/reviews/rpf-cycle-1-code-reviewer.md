# Code Review — RPF Cycle 1 (2026-05-01)

**Reviewer:** code-reviewer
**HEAD reviewed:** `894320ff`
**Scope:** Full codebase — src/, judge-worker-rs/, scripts/, deploy scripts

---

## Findings

### C1-CR-1: [MEDIUM] `password.ts` violates AGENTS.md password policy — adds checks beyond minimum length

- **File:** `src/lib/security/password.ts:44-68`
- **Confidence:** HIGH
- **Description:** The `getPasswordValidationError` function checks for common passwords, username similarity, and email similarity in addition to the 8-character minimum. AGENTS.md explicitly states: "Password validation MUST only check minimum length — exactly 8 characters minimum, no other rules. Do NOT add complexity requirements (uppercase, numbers, symbols), similarity checks, or dictionary checks."
- **Failure scenario:** A user who sets "password1" or a password containing their username gets a validation error, contradicting the documented policy that only minimum length should be checked.
- **Fix:** Remove the `COMMON_PASSWORDS` set, the username match check, and the email match check. Keep only `password.length < FIXED_MIN_PASSWORD_LENGTH`. Update the `PasswordValidationError` type to only include `"passwordTooShort"`. Update call sites accordingly.

### C1-CR-2: [LOW] Inconsistent `any` usage in `src/lib/db/import.ts`

- **File:** `src/lib/db/import.ts:19-24`
- **Confidence:** MEDIUM
- **Description:** `TABLE_MAP` is typed as `Record<string, any>` and `buildImportColumnSets` takes `Record<string, any>`. This bypasses type safety for the import pipeline.
- **Fix:** Define a proper table schema type or use `Record<string, unknown>` with type guards.

### C1-CR-3: [LOW] `latestSubmittedAt` comparison uses `>` on mixed `string | Date` type

- **File:** `src/lib/assignments/submissions.ts:625-627`
- **Confidence:** MEDIUM
- **Description:** In `getAssignmentStatusRows`, the `userLatestMap` aggregation compares `row.latestSubmittedAt` values using `>`. The type is `string | Date | null`. When PostgreSQL returns a timestamp, it can be either a string or a Date depending on the pg driver configuration. Using `>` on a string vs Date or two strings in different date formats could produce incorrect ordering.
- **Fix:** Normalize `latestSubmittedAt` to `Date` before comparison.

### C1-CR-4: [LOW] 27 client-side `console.error` sites without structured logging

- **File:** Multiple files under `src/app/(dashboard)/` and `src/components/`
- **Confidence:** HIGH (known carry-forward from C1-AGG-3)
- **Description:** Already tracked in deferred backlog. No new sites added beyond what was previously catalogued.

---

## No-issue confirmations

- Auth flow in `config.ts` uses timing-safe comparison for password verification and dummy hash for user enumeration prevention. Correct.
- CSRF validation in `csrf.ts` properly validates origin, sec-fetch-site, and X-Requested-With. Correct.
- Encryption module uses AES-256-GCM with proper IV and auth tag handling. Correct.
- `createApiHandler` wrapper properly chains rate limiting, auth, CSRF, and body validation. Correct.
