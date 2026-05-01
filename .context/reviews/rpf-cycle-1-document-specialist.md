# Document Specialist Review — RPF Cycle 1 (2026-05-01)

**Reviewer:** document-specialist
**HEAD reviewed:** `894320ff`

---

## Doc/code mismatch scan

### Password policy mismatch (CRITICAL)

**AGENTS.md:562-568 states:**
> Password validation MUST only check minimum length — exactly 8 characters minimum, no other rules. Do NOT add complexity requirements (uppercase, numbers, symbols), similarity checks, or dictionary checks.

**`src/lib/security/password.ts` implements:**
1. Minimum length check (8 chars) -- matches policy
2. Common password check (20-entry deny list) -- violates policy ("dictionary checks")
3. Username similarity check -- violates policy ("similarity checks")
4. Email local part match check -- violates policy ("similarity checks")

This is the most significant doc-code mismatch in the current codebase. The policy was presumably written to keep password validation simple, but the code diverged by adding "helpful" security checks.

---

## Findings

### C1-DOC-1: [MEDIUM] Password validation docs vs code mismatch

- **File:** `AGENTS.md:562-568` vs `src/lib/security/password.ts`
- **Confidence:** HIGH
- **Description:** AGENTS.md explicitly forbids the checks that password.ts implements. Either the documentation or the code must be updated.
- **Fix:** Either (a) update AGENTS.md to document the actual policy including common-password rejection and similarity checks, or (b) remove the extra checks from the code. Option (b) aligns with the stated design intent; option (a) acknowledges the security improvement. The project owner should decide.

### C1-DOC-2: [LOW] AGENTS.md references `PasswordValidationError` types that may not exist after fix

- **File:** `AGENTS.md:565-567`
- **Confidence:** MEDIUM
- **Description:** If the password checks are removed, the client-side form error message maps referencing `"passwordMatchesUsername"`, `"passwordMatchesEmail"`, and `"passwordTooCommon"` keys will have dead entries. The forms should be updated to remove these mappings.
- **Fix:** Update all form components that reference the removed error types.
