# Code Quality Review — RPF Cycle 11

**Date:** 2026-04-22
**Reviewer:** code-reviewer
**Base commit:** 42ca4c9a

## Findings

### CR-1: `problem-submission-form.tsx` displays raw API error in toast on compiler run failure — inconsistent with submission error path [MEDIUM/HIGH]

**File:** `src/components/problem/problem-submission-form.tsx:185`

**Description:** On the compiler run error path, line 185 displays the raw API error string directly to the user: `toast.error((errorBody as { error?: string }).error ?? tCommon("error"))`. In contrast, the submission error path on line 248 properly uses `toast.error(translateSubmissionError((errorBody as { error?: string }).error))` to map API errors to i18n keys. This is the same anti-pattern that was fixed across all discussion components in cycle 9 (AGG-4). The `translateSubmissionError` function already exists and maps known error codes — line 185 should use it too.

**Concrete failure scenario:** The compiler run API returns `{ error: "language_not_supported" }`. Line 185 displays the raw string "language_not_supported" to the user instead of a localized error message. The submission path on line 248 would correctly map this through `translateSubmissionError`.

**Fix:** Replace `toast.error((errorBody as { error?: string }).error ?? tCommon("error"))` with `toast.error(translateSubmissionError((errorBody as { error?: string }).error))` on line 185.

**Confidence:** HIGH

---

### CR-2: Unguarded `response.json()` on success paths — `response.ok` checked but no `.catch()` on the `.json()` call (result IS used) [MEDIUM/MEDIUM]

**Files:**
- `src/components/problem/problem-submission-form.tsx:188`
- `src/components/problem/problem-submission-form.tsx:252`
- `src/components/contest/contest-clarifications.tsx:79`
- `src/components/contest/contest-announcements.tsx:56`
- `src/components/problem/accepted-solutions.tsx:78`
- `src/components/contest/invite-participants.tsx:46`
- `src/lib/plugins/chat-widget/admin-config.tsx:104`
- `src/lib/plugins/chat-widget/providers.ts:138, 258, 398`

**Description:** After checking `response.ok`, these files call `await response.json()` without a `.catch()` guard. Unlike the previously fixed AGG-9 instances where the result was discarded, these calls DO use the result. However, if the server returns a non-JSON body on a 200 response (e.g., due to a proxy truncation, misconfiguration, or empty body), `response.json()` throws SyntaxError. The outer catch blocks show a generic error toast even though the request may have succeeded. This is a variant of AGG-9 from the previous aggregate.

**Concrete failure scenario:** A user submits code to the compiler. The API returns 200 with the run results. A reverse proxy truncates the response body due to a size limit. `response.json()` throws SyntaxError. The catch block shows `toast.error(tCommon("error"))`. The user thinks the run failed, but the code was actually compiled. They click "Run" again.

**Fix:** Wrap the `.json()` call in a try-catch within the success path, or use a helper function like `tryParseJson(response)` that returns `null` on parse failure. If `null`, show a specific "response parse error" toast.

**Confidence:** MEDIUM

---

### CR-3: `group-members-manager.tsx:225` dead `await response.json().catch(() => ({}))` call on remove success path [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:225`

**Description:** After a successful DELETE, line 225 calls `await response.json().catch(() => ({}))` and discards the result. This is dead code that was partially addressed in AGG-11 (the success-first pattern was fixed), but the dead `.json()` call remains. It serves no purpose — the response body is not needed after a successful member removal.

**Concrete failure scenario:** No user-visible failure, but the unnecessary await adds latency and the discarded result is confusing for maintainers.

**Fix:** Remove line 225.

**Confidence:** HIGH

---

### CR-4: `chat-widget/admin-config.tsx:97` sends `apiKey` in request body to test-connection endpoint — server-side SSRF risk [HIGH/HIGH]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:97`
**Server route:** `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:39`

**Description:** The admin config component sends the `apiKey` in the request body to the test-connection endpoint. The server route then uses this key directly to make outbound API calls (to OpenAI, Anthropic, or Google). An attacker with admin access (or via CSRF) could supply an arbitrary URL in the `model` field or manipulate the `apiKey` to make the server issue requests to internal services. While the endpoint validates the provider enum, the `model` field is a free-form string that could contain URLs or other injection payloads. The `gemini` case constructs a URL from the model: ``https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent``. A malicious model like `../../some-internal-service` would construct a different URL.

**Fix:** The test-connection endpoint should use the stored encrypted API key from the database rather than accepting it from the request body. The `model` field should be validated against a strict allowlist pattern per provider.

**Confidence:** MEDIUM

---

## Final Sweep

The cycle 9 fixes (discussion i18n, discarded response.json(), pagination upper bound, dialog semantics) are all properly implemented and verified. The main new findings this cycle are: (1) the raw API error display in `problem-submission-form.tsx` compiler run path — the same class of bug fixed in discussion components but missed here; (2) unguarded `response.json()` on success paths in multiple components where the result is used (a wider variant of AGG-9); (3) a dead `.json()` call in group-members-manager; and (4) the SSRF risk in the chat-widget test-connection endpoint carried from SEC-1.
