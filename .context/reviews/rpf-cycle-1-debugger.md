# Debugger Review — RPF Cycle 1 (2026-05-01)

**Reviewer:** debugger
**HEAD reviewed:** `894320ff`

---

## Latent bug surface scan

### TypeScript / ESLint status

- `npx tsc --noEmit`: 0 errors at HEAD.
- ESLint: 0 errors in `src/`. Warnings only in untracked scratch files outside `src/`.

### Findings

### C1-DB-1: [LOW] `latestSubmittedAt` mixed-type comparison in submissions.ts

- **File:** `src/lib/assignments/submissions.ts:625-627`
- **Confidence:** MEDIUM (same as C1-CR-3)
- **Description:** The comparison `row.latestSubmittedAt > existing.latestSubmittedAt` operates on `string | Date | null`. PostgreSQL timestamps may come back as strings or Date objects depending on pg driver config. When one side is a Date and the other is a string, the `>` operator performs reference comparison on Date objects (correct) but lexicographic comparison on strings (potentially incorrect for ISO 8601 dates with different timezone offsets). This is a latent bug that only manifests under specific driver/timezone configurations.
- **Failure scenario:** If one query returns a Date object and another returns a string (e.g., from a raw SQL query vs a Drizzle query), the comparison `string > Date` evaluates to `false` in JavaScript (since Date objects are never `>` than strings). This could cause the "latest" submission to be incorrectly identified.
- **Fix:** Normalize both sides to Date objects before comparison.

### C1-DB-2: [LOW] `password.ts` `PasswordValidationError` type includes values that the documented policy forbids

- **File:** `src/lib/security/password.ts:4-7`
- **Confidence:** HIGH (same as C1-CR-1)
- **Description:** The type `PasswordValidationError` includes `"passwordMatchesUsername"`, `"passwordMatchesEmail"`, and `"passwordTooCommon"` — all of which are validation errors that AGENTS.md says should not exist. Call sites that switch on these error types will have dead branches if the policy is enforced.
- **Fix:** Remove the extra error types and their corresponding validation logic.
