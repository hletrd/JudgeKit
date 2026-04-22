# Test Engineer Review — RPF Cycle 11

**Date:** 2026-04-22
**Reviewer:** test-engineer
**Base commit:** 42ca4c9a

## Findings

### TE-1: No unit tests for `problem-submission-form.tsx` — compiler run error path untested [MEDIUM/MEDIUM]

**File:** `src/components/problem/problem-submission-form.tsx`

**Description:** The problem submission form has no unit tests. The `handleRun` function's error path (raw API error display) and the `handleSubmit` function's error path (i18n-mapped error display) follow different patterns — this inconsistency would be caught by tests that verify the error toast content. The form has complex state management (source code, language selection, file upload) that should be tested.

**Fix:** Add unit tests covering: successful compiler run, compiler run with API error (verify i18n mapping), successful submission, submission with API error (verify i18n mapping), file upload, and source code validation.

**Confidence:** HIGH

---

### TE-2: No unit tests for `chat-widget/admin-config.tsx` — test-connection flow untested [LOW/MEDIUM]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx`

**Description:** The admin config component has no unit tests. The test-connection feature sends the API key from the form to the endpoint and displays the result. This flow should be tested to verify: successful connection test, failed connection test, and that the test uses the form key (not the stored key).

**Fix:** Add unit tests for the test-connection flow.

**Confidence:** MEDIUM

---

### TE-3: Security module test coverage still incomplete — encryption module untested [MEDIUM/HIGH]

**File:** `src/lib/security/encryption.ts`

**Description:** Carried from TE-1 (cycle 28). The encryption module has no dedicated tests. The plaintext fallback behavior (`decrypt()` returning input as-is when not prefixed with `enc:`) should be tested to ensure it doesn't accidentally validate tampered data. The `encrypt()`/`decrypt()` round-trip should be tested. The production key requirement should be tested.

**Fix:** Add unit tests for encrypt/decrypt round-trip, plaintext fallback, and production key requirement.

**Confidence:** HIGH

---

## Final Sweep

Test coverage for core hooks (useSubmissionPolling, useVisibilityPolling) remains a deferred item from cycle 1. The discussion module tests are a deferred item from cycle 9 (TE-1). The most impactful test gap this cycle is the `problem-submission-form.tsx` which has the raw API error display bug (CR-1) that would have been caught by tests verifying error toast content. The encryption module remains untested.
