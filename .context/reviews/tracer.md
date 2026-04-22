# Tracer Review — RPF Cycle 11

**Date:** 2026-04-22
**Reviewer:** tracer
**Base commit:** 42ca4c9a

## Findings

### TR-1: Causal trace of `problem-submission-form.tsx` compiler run error path — raw API error shown to user [MEDIUM/HIGH]

**Trace path:** User clicks "Run" -> `handleRun()` -> `apiFetch("/api/v1/compiler/run", ...)` -> server returns 400 with `{ error: "language_not_supported" }` -> `!response.ok` is true -> `errorBody = await response.json().catch(() => ({}))` -> `(errorBody as { error?: string }).error` returns `"language_not_supported"` -> `toast.error("language_not_supported")` -> user sees raw error code instead of localized message.

**Comparison trace (submit path):** User clicks "Submit" -> `handleSubmit()` -> `apiFetch("/api/v1/submissions", ...)` -> server returns 400 with `{ error: "language_not_supported" }` -> `!response.ok` is true -> `errorBody = await response.json().catch(() => ({}))` -> `translateSubmissionError((errorBody as { error?: string }).error)` returns localized message -> `toast.error(localizedMessage)` -> user sees proper error message.

**Description:** The same API error code follows two different paths in the same component. The run path displays the raw string; the submit path maps it through `translateSubmissionError()`. The `translateSubmissionError` function is available in both paths.

**Fix:** Use `translateSubmissionError()` on the run path (line 185).

**Confidence:** HIGH

---

### TR-2: Causal trace of chat-widget test-connection — API key from form vs stored key divergence [MEDIUM/MEDIUM]

**Trace path:** Admin changes API key in form -> clicks "Test Connection" -> `handleTestConnection()` -> `apiFetch("/api/v1/plugins/chat-widget/test-connection", { body: { apiKey: currentApiKey } })` -> server tests with the form key -> returns success -> admin sees green checkmark -> admin navigates away without saving -> stored key is still the old one -> chat widget uses the old (broken) key in production.

**Description:** The test-connection feature tests the key from the form, not the key that will be stored. This creates a false-positive feedback loop where the admin believes the connection works based on the test, but the actual configuration (stored in the database) is different.

**Fix:** Either (a) auto-save before testing, (b) show a warning that the test uses unsaved values, or (c) change the endpoint to test with the stored key.

**Confidence:** MEDIUM

---

### TR-3: Causal trace of `group-members-manager.tsx` remove — dead `.json()` call adds unnecessary await [LOW/LOW]

**Trace path:** Admin clicks "Remove" -> `handleRemoveMember()` -> `apiFetch(..., { method: "DELETE" })` -> `!response.ok` check -> line 225 `await response.json().catch(() => ({}))` -> result discarded -> local state updated -> success toast.

**Description:** The `await response.json().catch(() => ({}))` on line 225 is a no-op that adds a microtask delay. It reads the response body (which is discarded) and swallows any parse errors. The response body is not used anywhere after this line.

**Fix:** Remove line 225.

**Confidence:** HIGH

---

## Final Sweep

The prior cycle fixes were properly traced and verified. The main tracing concern this cycle is the `problem-submission-form.tsx` compiler run error path, which follows a different error handling strategy than the submit path. The chat-widget test-connection flow has a causal divergence between tested key and stored key.
