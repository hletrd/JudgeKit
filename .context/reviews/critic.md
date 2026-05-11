# Multi-Perspective Critique Review: JudgeKit

**Reviewer:** critic
**Date:** 2026-05-11
**Scope:** Hidden assumptions, blind spots, over/under-engineering — Cycle 2 of RPF loop

---

## New Findings Summary

| Severity | Count |
|----------|-------|
| MEDIUM   | 1     |
| LOW      | 1     |
| **Total**| **2** |

---

## MEDIUM

### CR1: Assignment-Form Dialog Uses `throw` for API Error Flow Control
- **File:** `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:278`
- **Confidence:** High
- **Description:** The form submission handler throws a `new Error()` with a translation key string when the API returns an error response. This creates an exception-based control flow inside a React event handler. While caught by the surrounding try/catch, it conflates programmer errors (bugs) with expected user-facing error conditions (validation failures). This is an anti-pattern that makes debugging harder — legitimate API errors appear in error boundaries and monitoring as thrown exceptions.
- **Failure scenario:** If an error boundary or global error reporter (Sentry, etc.) is added later, routine form validation errors will be reported as uncaught exceptions, drowning real bugs in noise.
- **Fix:** Return an error result object instead of throwing. Use explicit error propagation: `const result = await submitForm(); if (result.error) { setError(result.error); return; }`.

---

## LOW

### CR2: Verify-Email Page Assumes Token is the Only Search Param
- **File:** `src/app/(auth)/verify-email/page.tsx:13`
- **Confidence:** Medium
- **Description:** The component extracts only `token` from search params. If the URL contains additional params (e.g., `?token=abc&redirect=/dashboard`), the redirect target is lost. The success flow always pushes to `/login` regardless of where the user came from or where they should go next.
- **Failure scenario:** A user clicks a verification link from a recruiting invitation email. After verification, they are dumped at the generic login page instead of the recruiting flow they were in. This breaks contextual onboarding.
- **Fix:** Accept an optional `redirect` search param and navigate there on success. Fall back to `/login` only when no redirect is provided.

---

## Cross-File Observations

- The `throw` pattern in CR1 may exist in other form dialogs. A grep for `throw new Error\(.*\|\|.*\)` in form components would reveal the scope.
- The verify-email page was added as a minimal surface (SMTP feature). It lacks several affordances that other auth flows have: no redirect preservation, no resend link, no rate-limiting indication.
