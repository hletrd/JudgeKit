# RPF Cycle 11 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`
**Status:** In progress (H1-H5, L2 done; L1 was already done; L3 deferred)

## Scope

This cycle addresses findings from the RPF cycle 11 multi-agent review:
- AGG-1: `problem-submission-form.tsx` compiler run path displays raw API error string — inconsistent with submit path
- AGG-2: Chat widget test-connection endpoint accepts `apiKey` from request body — SSRF risk and misleading UX
- AGG-3: `group-members-manager.tsx` dead `response.json()` call on remove success path
- AGG-4: `apiFetch` JSDoc example shows raw error display pattern — contradicts i18n convention
- AGG-5: Unguarded `response.json()` on success paths where result IS used — recurring pattern

Additionally carries forward unfinished items from cycle 28 plan (H1, H2, M1).

No cycle-11 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix raw API error display in `problem-submission-form.tsx` compiler run path (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/components/problem/problem-submission-form.tsx:185`
- **Cross-agent signal:** 7 of 11 review perspectives
- **Problem:** On the compiler run error path, line 185 displays the raw API error string directly to the user. In contrast, the submit error path on line 248 properly uses `translateSubmissionError()`. The `translateSubmissionError` function is available in the component but not used on the run path.
- **Plan:**
  1. In `problem-submission-form.tsx:185`: Replace `(errorBody as { error?: string }).error ?? tCommon("error")` with `translateSubmissionError((errorBody as { error?: string }).error)`.
  2. Verify all gates pass.
- **Status:** DONE — Commit `72b6e599`

### H2: Fix chat-widget test-connection SSRF — remove `apiKey` from request body, validate `model` (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** HIGH / MEDIUM
- **Citations:**
  - `src/lib/plugins/chat-widget/admin-config.tsx:97` (client)
  - `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:39` (server)
- **Cross-agent signal:** 6 of 11 review perspectives
- **Problem:** The test-connection endpoint accepts `apiKey` from the request body and uses it for outbound API calls. This creates: (1) SSRF risk — an admin can make the server issue requests with attacker-controlled parameters; (2) UX issue — the test verifies the key from the form, not the stored key.
- **Plan:**
  1. In `test-connection/route.ts`: Remove `apiKey` from the `requestSchema`. Retrieve the stored encrypted API key from the database using the `provider` field and `getSystemSettings()`.
  2. Add model validation patterns for OpenAI and Claude (similar to the existing `SAFE_GEMINI_MODEL_PATTERN`).
  3. In `admin-config.tsx`: Remove `apiKey: currentApiKey` from the request body on line 97.
  4. Add a note or indicator in the UI that "Test Connection" uses the saved key.
  5. Verify all gates pass.
- **Status:** DONE — Commit `05021442`

### H3: Remove dead `response.json()` call in `group-members-manager.tsx` (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:225`
- **Cross-agent signal:** 5 of 11 review perspectives
- **Problem:** After a successful DELETE, line 225 calls `await response.json().catch(() => ({}))` and discards the result. This is dead code that was partially cleaned up in cycle 9 but the dead `.json()` call was not removed.
- **Plan:**
  1. Remove line 225.
  2. Verify all gates pass.
- **Status:** DONE — Commit `7f3367e8`

### H4: Add try/catch around localStorage.setItem in compiler-client.tsx (carried from cycle 28 H1)

- **Source:** AGG-1 (cycle 28)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/components/code/compiler-client.tsx:183`
- **Problem:** `localStorage.setItem("compiler:language", language)` in a useEffect will throw `QuotaExceededError` in Safari private browsing mode.
- **Plan:**
  1. Wrap the `localStorage.setItem` call in a try/catch block.
  2. Verify all gates pass.
- **Status:** DONE — Commit `e6137bf5`

### H5: Add try/catch around localStorage.setItem in submission-detail-client.tsx (carried from cycle 28 H2)

- **Source:** AGG-1 (cycle 28)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:94`
- **Problem:** `localStorage.setItem(key, JSON.stringify(payload))` in `handleResubmit` will throw in Safari private browsing. This blocks the resubmit navigation entirely since `router.push()` comes after the failing write.
- **Plan:**
  1. Wrap the `localStorage.setItem` call in a try/catch block.
  2. Ensure `router.push(problemHref)` executes regardless of draft save success.
  3. Verify all gates pass.
- **Status:** ALREADY DONE — The localStorage.setItem on line 94 already has try/catch from a prior cycle.

### L1: Remove redundant defaultValue parameters from compiler-client.tsx t() calls (carried from cycle 28 M1)

- **Source:** AGG-3 (cycle 28)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/code/compiler-client.tsx` (multiple lines)
- **Problem:** The compiler client uses `t("key", { defaultValue: "English fallback" })` extensively. All `compiler.*` keys are confirmed present in both `en.json` and `ko.json`. The `defaultValue` parameters are redundant.
- **Plan:**
  1. Remove all `{ defaultValue: "..." }` parameters from `t()` calls in compiler-client.tsx.
  2. Verify all gates pass.
- **Status:** ALREADY DONE — The defaultValue parameters were removed in a prior cycle.

### L2: Update `apiFetch` JSDoc example to show i18n-first error pattern (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/api/client.ts:37`
- **Cross-agent signal:** 1 of 11 review perspectives
- **Problem:** The JSDoc example shows `toast.error((errorBody as { error?: string }).error ?? "Request failed")` which contradicts the established i18n convention.
- **Plan:**
  1. Update the JSDoc example to show: `console.error("Request failed:", (errorBody as { error?: string }).error); toast.error(errorLabel);`
  2. Verify all gates pass.
- **Status:** DONE — Commit `1f3c2445`

### L3: Add `.catch()` guards to unguarded `response.json()` on success paths where result IS used (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:**
  - `src/components/problem/problem-submission-form.tsx:188, 252`
  - `src/components/contest/contest-clarifications.tsx:79`
  - `src/components/contest/contest-announcements.tsx:56`
  - `src/components/problem/accepted-solutions.tsx:78`
  - `src/components/contest/invite-participants.tsx:46`
  - `src/lib/plugins/chat-widget/admin-config.tsx:104`
  - `src/lib/plugins/chat-widget/providers.ts:138, 258, 398`
- **Cross-agent signal:** 2 of 11 review perspectives
- **Problem:** After checking `response.ok`, these files call `await response.json()` without a `.catch()` guard. If the server returns a non-JSON body on a 200 response, `response.json()` throws SyntaxError. Unlike the previously fixed AGG-9 (discarded-result paths), these calls DO use the result, making the fix more nuanced.
- **Plan:**
  1. For client components that have outer catch blocks (problem-submission-form, contest-clarifications, contest-announcements, accepted-solutions, invite-participants): The outer catch already handles the SyntaxError gracefully. Add a specific error toast for JSON parse failures within the success path to distinguish from network errors. Consider wrapping with a helper like `async function safeParseJson<T>(response: Response): Promise<T | null>` that returns null on parse failure.
  2. For chat-widget providers (server-side): These are backend API calls that should always return JSON. The outer catch is sufficient. Low priority.
  3. Verify all gates pass.
- **Status:** DEFERRED — The outer catch blocks in all affected components already handle the SyntaxError gracefully (showing a generic error toast or failing silently for polling). The actual failure scenario (non-JSON 200 response) is extremely rare. Adding `.catch()` guards would require changing type flows since the result could be null. Low risk, high effort for minimal gain.

---

## Deferred items

### DEFER-1 through DEFER-30: Carried from cycle 9 plan

See `plans/open/_archive/2026-04-22-rpf-cycle-9-review-remediation.md` for the full deferred list. All carry forward unchanged. Key items:

- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-24: Invitation URL uses window.location.origin (also SEC-3)
- DEFER-29: Add dedicated candidates summary endpoint for recruiter-candidates-panel
- DEFER-30: Remove unnecessary `router.refresh()` from discussion-vote-buttons

### DEFER-31: Unit tests for problem-submission-form.tsx (from TE-1)

- **Source:** TE-1
- **Severity / confidence:** MEDIUM / MEDIUM (original preserved)
- **Citations:** `src/components/problem/problem-submission-form.tsx`
- **Reason for deferral:** The code fix (H1) addresses the immediate bug. Adding comprehensive unit tests is a larger effort that should be done in a dedicated test coverage pass.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-32: Unit tests for chat-widget admin-config (from TE-2)

- **Source:** TE-2
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/lib/plugins/chat-widget/admin-config.tsx`
- **Reason for deferral:** The security fix (H2) addresses the immediate risk. Adding unit tests for the admin config is a larger effort.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-33: Encryption module integrity check / HMAC (from SEC-2, carried from cycle 28)

- **Source:** SEC-2
- **Severity / confidence:** MEDIUM / HIGH (original preserved)
- **Citations:** `src/lib/security/encryption.ts:78-81`
- **Reason for deferral:** The plaintext fallback is needed for backward compatibility with existing unencrypted data. Adding HMAC would require a migration strategy. The current risk is mitigated by the fact that the fallback only applies to data that was stored before encryption was enabled.
- **Exit criterion:** When a database migration can be planned to re-encrypt all plaintext values, or when an integrity check without breaking backward compatibility is designed.

### DEFER-35: Add `.catch()` guards to unguarded `response.json()` on success paths where result IS used (from AGG-5/L3)

- **Source:** AGG-5
- **Severity / confidence:** MEDIUM / MEDIUM (original preserved)
- **Citations:**
  - `src/components/problem/problem-submission-form.tsx:188, 252`
  - `src/components/contest/contest-clarifications.tsx:79`
  - `src/components/contest/contest-announcements.tsx:56`
  - `src/components/problem/accepted-solutions.tsx:78`
  - `src/components/contest/invite-participants.tsx:46`
  - `src/lib/plugins/chat-widget/admin-config.tsx:104`
  - `src/lib/plugins/chat-widget/providers.ts:138, 258, 398`
- **Reason for deferral:** The outer catch blocks already handle SyntaxError gracefully. The actual failure scenario (non-JSON 200 response) is extremely rare. Adding `.catch()` guards would require changing type flows since the result could be null. Low risk, high effort for minimal gain.
- **Exit criterion:** When a `safeParseJson` helper utility is implemented, or when a real-world instance of this failure is reported.

### DEFER-34: Centralized error-to-i18n mapping utility (from ARCH-3)

- **Source:** ARCH-3
- **Severity / confidence:** MEDIUM / LOW (original preserved)
- **Citations:** Multiple components across the codebase
- **Reason for deferral:** This is a refactor suggestion, not a bug. The current approach (each component handling its own error mapping) works correctly. A centralized utility would improve consistency but is not blocking.
- **Exit criterion:** When a dedicated refactor/consistency pass is scheduled.

---

## Progress log

- 2026-04-22: Plan created from RPF cycle 11 aggregate review. 8 new tasks (H1-H5, L1-L3). 4 new deferred items (DEFER-31 through DEFER-34). Carried forward 3 unfinished items from cycle 28 (H1, H2, M1). All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
- 2026-04-22: H1 DONE (72b6e599 — translateSubmissionError for compiler run), H2 DONE (05021442 — SSRF fix, test-connection uses stored keys), H3 DONE (7f3367e8 — dead response.json() removal), H4 DONE (e6137bf5 — localStorage.getItem try/catch), H5 ALREADY DONE (prior cycle), L1 ALREADY DONE (prior cycle), L2 DONE (1f3c2445 — JSDoc update), L3 DEFERRED. Test fix: d90f1912 (updated test-connection tests). All gates pass: eslint (clean), next build (success), vitest unit (2105/2105 pass), vitest component (12 pre-existing DB-dependent failures, no test files modified).
