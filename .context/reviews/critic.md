# Critic Review — RPF Cycle 11

**Date:** 2026-04-22
**Reviewer:** critic
**Base commit:** 42ca4c9a

## Findings

### CRI-1: `problem-submission-form.tsx` Run vs Submit error handling inconsistency — same component, two different UX patterns [MEDIUM/HIGH]

**File:** `src/components/problem/problem-submission-form.tsx:185` vs `248`

**Description:** The compiler run error path shows raw API error strings to users (`(errorBody as { error?: string }).error ?? tCommon("error")`), while the submit error path properly maps them through `translateSubmissionError()`. From a user's perspective, clicking "Run" and getting a cryptic error code like `"language_not_supported"` vs clicking "Submit" and getting a properly localized message is jarring and inconsistent. This is a user experience problem that was fixed across all discussion components in cycle 9 but was missed in this form.

**Concrete failure scenario:** A user selects an unsupported language and clicks "Run". They see the raw error code "language_not_supported" in a toast. They then click "Submit" and see a proper localized message for the same underlying error. This creates confusion about the quality of the application.

**Fix:** Use `translateSubmissionError()` on the compiler run error path (line 185) just as it is used on the submit path (line 248).

**Confidence:** HIGH

---

### CRI-2: `chat-widget/admin-config.tsx` sends API key in plain text to test-connection endpoint — admin credentials in transit [MEDIUM/MEDIUM]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:97`

**Description:** The admin configuration form sends the API key in the request body to the test-connection endpoint. While the connection is over HTTPS, the key is sent from the client to the server where it could be logged or stored in request logs. The endpoint already has access to the encrypted keys in the database. Sending the key from the client creates an unnecessary exposure surface. This is the same finding as SEC-1 but from a UX/critic perspective — even if the endpoint is admin-only, the key should not be retransmitted when the server already has it stored.

**Fix:** The test-connection endpoint should retrieve the key from the database rather than accepting it from the client. The client should only send the provider and model.

**Confidence:** MEDIUM

---

### CRI-3: `group-members-manager.tsx` remove handler still has dead `response.json()` call — code clarity issue [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:225`

**Description:** The remove handler has a dead `await response.json().catch(() => ({}))` call on line 225 after the success-first pattern was implemented. The result is discarded. This is leftover dead code that was partially cleaned up in a prior cycle but not fully.

**Fix:** Remove line 225.

**Confidence:** HIGH

---

### CRI-4: `contest-clarifications.tsx:77` throws raw error string on `!response.ok` — not mapped to i18n [MEDIUM/MEDIUM]

**File:** `src/components/contest/contest-clarifications.tsx:77`

**Description:** When the clarifications fetch returns `!response.ok`, the code throws `new Error("contestClarificationsFetchFailed")` which is caught and displayed in the catch block as a toast. The catch block uses `toast.error(t("fetchError"))` which is correct. However, the `throw new Error("contestClarificationsFetchFailed")` is misleading — the string is used as an Error message but is never displayed to the user (the catch block uses its own i18n key). The throw is used purely for control flow, not for the message.

This is an acceptable pattern but could be cleaner. The same pattern exists in `contest-announcements.tsx:54` and `accepted-solutions.tsx:76`.

**Fix:** This is stylistic. Consider using a custom `ApiError` class or just `throw undefined` to make the control-flow intent clearer. Low priority.

**Confidence:** LOW

---

## Final Sweep

The codebase is in good shape overall. The cycle 9 fixes are properly implemented — discussion components use i18n keys consistently, the pagination upper bound prevents DoS, dialog semantics are in place. The main systemic issue this cycle is the raw API error display in the compiler run path of `problem-submission-form.tsx` — the same class of bug that was fixed in the discussion module but was missed here. The chat-widget API key transmission is a design concern that should be addressed. The dead code in group-members-manager is a minor cleanliness issue.
