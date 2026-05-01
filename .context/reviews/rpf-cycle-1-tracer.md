# Tracer Review — RPF Cycle 1 (2026-05-01)

**Reviewer:** tracer
**HEAD reviewed:** `894320ff`

---

## Causal trace of suspicious flows

### Password validation trace

Tracing the password validation flow:
1. `src/lib/security/password.ts:getPasswordValidationError()` — checks length, common passwords, username match, email match
2. `src/lib/security/password.ts:isStrongPassword()` — wraps `getPasswordValidationError`
3. Call sites: `src/app/(auth)/signup/signup-form.tsx`, `src/app/(dashboard)/dashboard/admin/users/add-user-dialog.tsx`, `src/app/(dashboard)/dashboard/admin/users/edit-user-dialog.tsx`, `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx`, `src/app/change-password/change-password-form.tsx`
4. Server actions: `src/lib/actions/public-signup.ts`, `src/lib/actions/user-management.ts`, `src/lib/actions/change-password.ts`

The `PasswordValidationError` type is used in client-side forms to display error messages. The keys `"passwordMatchesUsername"`, `"passwordMatchesEmail"`, and `"passwordTooCommon"` are mapped to localized error strings in the form components. Removing them from the type will require updating the form components' error message maps.

---

## Findings

### C1-TR-1: [MEDIUM] Password validation policy mismatch — full trace

- **File:** `src/lib/security/password.ts` and all call sites
- **Confidence:** HIGH
- **Description:** Tracing confirms the extra checks are wired through the entire stack: type definition -> validation function -> server actions -> client forms. The `PasswordValidationError` type union feeds into localized error message maps in 5+ client components. Removing the extra checks requires updating the type and all error message maps.
- **Fix:** Remove `COMMON_PASSWORDS`, username match, and email match from `getPasswordValidationError`. Remove `passwordMatchesUsername`, `passwordMatchesEmail`, `passwordTooCommon` from the `PasswordValidationError` type. Remove corresponding error message entries from all form components. Update tests.
