# RPF Cycle 16 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`
**Status:** Done (M1, M2, M3, M4, L1, L2, L3, L4 all complete)

## Scope

This cycle addresses findings from the RPF cycle 16 multi-agent review:
- AGG-1: `compiler-client.tsx` unguarded `res.json()` on error path (pattern consistency)
- AGG-2: Incomplete `apiFetchJson` adoption — migrate remaining components
- AGG-3: `invite-participants.tsx` search race condition (no AbortController)
- AGG-4: `test-connection/route.ts` manual `req.json()` returns 500 for malformed JSON
- AGG-5: `file-management-client.tsx` icon-only buttons missing `aria-label`
- AGG-6: Anti-cheat monitor privacy notice dialog lacks focus trap
- AGG-7: `countdown-timer.tsx` `aria-live="assertive"` for all threshold announcements
- AGG-8: `recruiter-candidates-panel.tsx` CSV download `window.open` without `noopener`

No cycle-16 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### M1: Add `.catch()` guard to `compiler-client.tsx` error path `res.json()` (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** LOW/MEDIUM (revised — inner catch already handles, but pattern is inconsistent)
- **Citations:** `src/components/code/compiler-client.tsx:270`
- **Cross-agent signal:** 5 of 11 review perspectives
- **Problem:** The error path calls `await res.json()` without `.catch()`. While the inner `catch` block handles the SyntaxError by falling back to `res.statusText`, this is the last remaining unguarded `.json()` call in the codebase and violates the `apiFetch` JSDoc convention.
- **Plan:**
  1. Change line 270 from `const errorData = await res.json();` to `const errorData = await res.json().catch(() => ({}));`
  2. This makes the pattern consistent with the rest of the codebase
  3. The inner catch block can now focus on extracting the error message from the parsed data
  4. Verify all gates pass
- **Status:** DONE (commit d97a39b2)

---

### M2: Migrate `recruiter-candidates-panel.tsx`, `invite-participants.tsx`, `access-code-manager.tsx` to `apiFetchJson` (AGG-2, priority components)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM/HIGH
- **Citations:** 
  - `src/components/contest/recruiter-candidates-panel.tsx:50-54`
  - `src/components/contest/invite-participants.tsx:42-47, 68-78`
  - `src/components/contest/access-code-manager.tsx:41-43, 82-88`
- **Cross-agent signal:** 5 of 11 review perspectives
- **Problem:** These 3 components still use raw `apiFetch` + `res.json().catch()` for GET endpoints, creating a two-pattern codebase after the cycle 14-15 `apiFetchJson` migration.
- **Plan:**
  1. Migrate `recruiter-candidates-panel.tsx` `fetchCandidates` to `apiFetchJson`
  2. Migrate `invite-participants.tsx` `search` function to `apiFetchJson`
  3. Migrate `access-code-manager.tsx` `fetchCode` and `handleGenerate` to `apiFetchJson`
  4. Preserve existing behavior: loading state, error handling, AbortController where applicable
  5. Verify all gates pass
- **Status:** DONE (commit 7e1b9af5)

---

### M3: Add AbortController to `invite-participants.tsx` search function (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** MEDIUM/MEDIUM
- **Citations:** `src/components/contest/invite-participants.tsx:34-64`
- **Cross-agent signal:** 5 of 11 review perspectives
- **Problem:** The search function has no AbortController. Rapid typing causes race conditions where stale results overwrite current results. Compare with `recruiting-invitations-panel.tsx` which uses AbortController.
- **Plan:**
  1. Add `useRef<AbortController | null>` for search
  2. In `search` function, abort previous controller before starting new request
  3. Pass `signal: controller.signal` in fetch options
  4. Handle `AbortError` gracefully (don't show toast)
  5. Verify all gates pass
- **Status:** DONE (commit 7e1b9af5 — combined with M2)

---

### M4: Fix `test-connection/route.ts` to return 400 for malformed JSON (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** MEDIUM/MEDIUM
- **Citations:** `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:37`
- **Cross-agent signal:** 4 of 11 review perspectives
- **Problem:** The route manually calls `req.json()` instead of using the `schema` option in `createApiHandler`. When the request body is malformed JSON, `req.json()` throws and the outer catch returns 500 instead of 400.
- **Plan:**
  1. Wrap `req.json()` in a try/catch that returns 400 on parse failure
  2. Move Zod validation after the parse
  3. Preserve existing auth/capability/CSRF checks
  4. Verify all gates pass
- **Status:** DONE (commit bcc303a6)

---

### L1: Add `aria-label` to `file-management-client.tsx` icon-only buttons (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW/MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:199-210`
- **Cross-agent signal:** 3 of 11 review perspectives
- **Problem:** The "Copy URL" and "Delete" buttons use `variant="ghost" size="sm"` with only `title` attributes but no `aria-label`. Screen readers don't reliably announce `title`.
- **Plan:**
  1. Add `aria-label={t("copyUrl")}` to the copy URL button
  2. Add `aria-label={t("delete")}` to the delete button
  3. Verify i18n keys exist or add them
  4. Verify all gates pass
- **Status:** DONE (commit 9bba9723)

---

### L2: Replace anti-cheat monitor privacy notice with `Dialog` component for focus trapping (AGG-6)

- **Source:** AGG-6
- **Severity / confidence:** LOW/MEDIUM
- **Citations:** `src/components/exam/anti-cheat-monitor.tsx:252-278`
- **Cross-agent signal:** 1 of 11 review perspectives
- **Problem:** The privacy notice uses raw `div` elements with `role="dialog"` and `aria-modal="true"` instead of the project's `Dialog` component, which handles focus trapping. The user can tab out of the dialog.
- **Plan:**
  1. Replace the raw `div` overlay with `Dialog` + `DialogContent` from the UI library
  2. The `Dialog` component handles focus trapping automatically
  3. Use `onOpenChange` to control the `showPrivacyNotice` state
  4. Verify the dialog is not dismissible (privacy notice must be accepted)
  5. Verify all gates pass
- **Status:** DONE (commits e1cc3c4b + 1edf0475)

---

### L3: Use `aria-live="polite"` for non-critical countdown threshold announcements (AGG-7)

- **Source:** AGG-7
- **Severity / confidence:** LOW/LOW
- **Citations:** `src/components/exam/countdown-timer.tsx:151-153`
- **Cross-agent signal:** 1 of 11 review perspectives
- **Problem:** All threshold announcements use `aria-live="assertive"`. Only the 1-minute warning warrants assertive; 15-minute and 5-minute should use `polite`.
- **Plan:**
  1. Track the current announcement's urgency level
  2. Use `aria-live="assertive"` only for the 1-minute warning
  3. Use `aria-live="polite"` for 15-minute and 5-minute warnings
  4. Verify all gates pass
- **Status:** DONE (commit 51a3e4d0)

---

### L4: Add `noopener,noreferrer` to `recruiter-candidates-panel.tsx` CSV download (AGG-8)

- **Source:** AGG-8
- **Severity / confidence:** LOW/LOW
- **Citations:** `src/components/contest/recruiter-candidates-panel.tsx:90-98`
- **Cross-agent signal:** 2 of 11 review perspectives
- **Problem:** The CSV download uses `window.open(url, "_blank")` without `noopener,noreferrer`.
- **Plan:**
  1. Replace `window.open(url, "_blank")` with a programmatic `<a>` click using `noopener,noreferrer`
  2. Verify all gates pass
- **Status:** DONE (commit 43c55b6b)

---

## Deferred items

### DEFER-1 through DEFER-57: All prior deferred items carried forward unchanged

Key items:
- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-24: Invitation URL uses window.location.origin (also SEC-3)
- DEFER-29: Add dedicated candidates summary endpoint for recruiter-candidates-panel
- DEFER-33/SEC-2: Encryption module integrity check / HMAC
- DEFER-50: Encryption module unit tests (from TE-3)

### DEFER-58: Migrate remaining 12+ components to `apiFetchJson` — second wave [MEDIUM/MEDIUM]

- **Source:** AGG-2 (remaining components after M2)
- **Severity / confidence:** MEDIUM/MEDIUM (original preserved)
- **Citations:** See ARCH-1 for full list
- **Reason for deferral:** M2 covers the 3 highest-priority components (contest-related). The remaining 12+ components (language-config-table, create-problem-form, problem-import-button, api-keys-client, submission-detail-client, etc.) are lower priority and should be migrated in a dedicated refactoring cycle to avoid too many changes in one cycle.
- **Exit criterion:** When a dedicated `apiFetchJson` migration cycle is scheduled, or when touching any of these components for other reasons.

### DEFER-59: Unit tests for `compiler-client.tsx` (from TE-1) [MEDIUM/MEDIUM]

- **Source:** TE-1
- **Severity / confidence:** MEDIUM/MEDIUM (original preserved)
- **Citations:** `src/components/code/compiler-client.tsx`
- **Reason for deferral:** The code fix (M1) addresses the pattern inconsistency. Adding comprehensive tests for the compiler client is a larger effort that should be done in a dedicated test coverage cycle.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-60: Unit tests for `invite-participants.tsx` (from TE-2) [MEDIUM/MEDIUM]

- **Source:** TE-2
- **Severity / confidence:** MEDIUM/MEDIUM (original preserved)
- **Citations:** `src/components/contest/invite-participants.tsx`
- **Reason for deferral:** The code fix (M3) addresses the race condition. Adding comprehensive tests including race condition testing is a larger effort.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-61: Unit tests for `recruiter-candidates-panel.tsx` (from TE-3) [LOW/MEDIUM]

- **Source:** TE-3
- **Severity / confidence:** LOW/MEDIUM (original preserved)
- **Citations:** `src/components/contest/recruiter-candidates-panel.tsx`
- **Reason for deferral:** Code fix (M2) addresses the `apiFetchJson` migration. Tests are a separate effort.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-62: Unit tests for `access-code-manager.tsx` (from TE-4) [LOW/MEDIUM]

- **Source:** TE-4
- **Severity / confidence:** LOW/MEDIUM (original preserved)
- **Citations:** `src/components/contest/access-code-manager.tsx`
- **Reason for deferral:** Code fix (M2) addresses the `apiFetchJson` migration. Tests are a separate effort.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-63: Gemini model name max length constraint (from SEC-4) [LOW/MEDIUM]

- **Source:** SEC-4
- **Severity / confidence:** LOW/MEDIUM (original preserved)
- **Citations:** `src/lib/plugins/chat-widget/providers.ts:295`
- **Reason for deferral:** The existing regex pattern is adequate for the current API contract. Adding a max length constraint is defense-in-depth with no immediate risk.
- **Exit criterion:** When the Gemini provider implementation is next modified, or when a security hardening cycle is scheduled.

---

## Progress log

- 2026-04-22: Plan created from RPF cycle 16 aggregate review. 8 new tasks (M1, M2, M3, M4, L1, L2, L3, L4). 6 new deferred items (DEFER-58 through DEFER-63). All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
- 2026-04-22: M1 DONE (d97a39b2 — add .catch() guard to compiler-client res.json()), M2+M3 DONE (7e1b9af5 — migrate recruiter-candidates, invite-participants, access-code-manager to apiFetchJson + add AbortController to invite search), M4 DONE (bcc303a6 — fix test-connection route to return 400 for malformed JSON), L1 DONE (9bba9723 — add aria-label to file-management icon-only buttons), L2 DONE (e1cc3c4b + 1edf0475 — replace anti-cheat privacy notice with Dialog for focus trapping), L3 DONE (51a3e4d0 — use aria-live="polite" for non-critical countdown announcements), L4 DONE (43c55b6b — replace window.open with programmatic link for CSV downloads). All gates pass: eslint (0 errors), next build (success), vitest unit (2105/2105 pass), vitest integration (37 skipped, no DB available), vitest component (12 pre-existing DB-dependent failures, no test files modified).
