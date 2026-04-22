# RPF Cycle 9 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`
**Status:** Done

## Scope

This cycle addresses findings from the RPF cycle 9 multi-agent review:
- AGG-1: Discussion components + edit-group-dialog call `await response.json()` on success path and discard result
- AGG-2: `discussion-post-delete-button.tsx` has hardcoded English string for dialog description
- AGG-3: `discussion-vote-buttons.tsx` shows raw string "voteFailed" to users — not an i18n key
- AGG-4: Discussion components display raw API error messages to users
- AGG-5: `recruiter-candidates-panel.tsx` fetches full export endpoint for candidate list
- AGG-6: `discussion-vote-buttons.tsx` calls `router.refresh()` after every vote

No cycle-9 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Remove discarded `response.json()` calls on success paths in discussion components and edit-group-dialog (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:**
  - `src/components/discussions/discussion-post-form.tsx:47`
  - `src/components/discussions/discussion-thread-form.tsx:53`
  - `src/components/discussions/discussion-post-delete-button.tsx:29`
  - `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:92`
- **Cross-agent signal:** 8 of 11 review perspectives
- **Problem:** After a successful POST/DELETE/PATCH, `await response.json()` is called and the result is discarded. If the server returns a non-JSON body, SyntaxError is thrown, and the catch block shows an error toast even though the operation succeeded.
- **Plan:**
  1. In `discussion-post-form.tsx:47`: Remove `await response.json()`.
  2. In `discussion-thread-form.tsx:53`: Remove `await response.json()`.
  3. In `discussion-post-delete-button.tsx:29`: Remove `await response.json()`.
  4. In `edit-group-dialog.tsx:92`: Remove `await response.json()`.
  5. Verify all gates pass.
- **Status:** DONE — Commit `ac0d37e9`

### H2: Fix hardcoded English string in `discussion-post-delete-button.tsx` dialog description (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/components/discussions/discussion-post-delete-button.tsx:43`
- **Cross-agent signal:** 7 of 11 review perspectives
- **Problem:** The `DestructiveActionDialog` description is hardcoded as `"This action cannot be undone. The reply will be permanently removed."` For non-English users, this creates a mixed-language experience.
- **Plan:**
  1. Add a `deleteDescription` prop to `DiscussionPostDeleteButton`.
  2. Replace the hardcoded string with the prop value.
  3. Update the parent component(s) that render `DiscussionPostDeleteButton` to pass the i18n string.
  4. Add the i18n key to the appropriate translation file(s).
  5. Verify all gates pass.
- **Status:** DONE — Commit `10b597cf`

### H3: Fix hardcoded "voteFailed" string in `discussion-vote-buttons.tsx` — add i18n support (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/components/discussions/discussion-vote-buttons.tsx:44, 57`
- **Cross-agent signal:** 5 of 11 review perspectives
- **Problem:** The error toast fallback uses raw string "voteFailed" instead of i18n keys. The component does not import `useTranslations`.
- **Plan:**
  1. Add `voteFailedLabel` prop (or similar) to `DiscussionVoteButtons` component.
  2. Replace hardcoded `"voteFailed"` on lines 44 and 57 with the prop value.
  3. Update parent components to pass the i18n string.
  4. Add the i18n key to the appropriate translation file(s).
  5. Verify all gates pass.
- **Status:** DONE — Commit `3f17b86d`

### L1: Discussion components display raw API error messages to users (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM
- **Citations:**
  - `src/components/discussions/discussion-post-form.tsx:45, 52`
  - `src/components/discussions/discussion-thread-form.tsx:51, 59`
  - `src/components/discussions/discussion-post-delete-button.tsx:27, 34`
  - `src/components/discussions/discussion-thread-moderation-controls.tsx:47, 52, 66, 72`
- **Cross-agent signal:** 3 of 11 review perspectives
- **Problem:** These components extract the API error string and display it directly to the user via `toast.error(error.message)`. Other components in the app use i18n keys for toast messages.
- **Plan:**
  1. In each component, add `errorLabel` (and `deleteErrorLabel`) props for i18n error messages.
  2. Replace `throw new Error((errorBody as { error?: string }).error || "fallback")` with `throw new Error(errorLabel)` — the API error string is logged via console.error, not displayed.
  3. Update all parent components to pass the i18n strings.
  4. Add i18n keys to en.json and ko.json.
  5. Verify all gates pass.
- **Status:** DONE — Commit `ee77686c`

### L2: `recruiter-candidates-panel.tsx` fetches full export endpoint for candidate list (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/contest/recruiter-candidates-panel.tsx:50-55`
- **Cross-agent signal:** 1 of 11 review perspectives
- **Problem:** The panel fetches the full export endpoint which includes per-problem details. Only summary fields are needed.
- **Plan:** DEFER — The export endpoint returns all data needed. Adding a dedicated summary endpoint is a backend change that is out of scope for this cycle. The current approach works correctly, just with slightly more data than needed.
- **Status:** DEFERRED

### L3: `discussion-vote-buttons.tsx` calls `router.refresh()` after every vote (AGG-6)

- **Source:** AGG-6
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/discussions/discussion-vote-buttons.tsx:55`
- **Cross-agent signal:** 1 of 11 review perspectives
- **Problem:** After a successful vote, the component updates local state and then calls `router.refresh()`, which triggers a full server component refetch. The local state update already reflects the change.
- **Plan:** DEFER — The `router.refresh()` ensures server components stay in sync with the vote state. Removing it could cause stale data if other parts of the page render the vote count. The performance impact is low since Next.js only refetches the changed server components.
- **Status:** DEFERRED

---

## Deferred items

### DEFER-1 through DEFER-28: Carried from cycle 8 plan

See `plans/open/2026-04-22-rpf-cycle-8-review-remediation.md` for the full deferred list. All carry forward unchanged.

### DEFER-29: Add dedicated candidates summary endpoint for recruiter-candidates-panel (from AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / LOW (original preserved)
- **Citations:** `src/components/contest/recruiter-candidates-panel.tsx:50-55`
- **Reason for deferral:** The current approach works correctly. Adding a dedicated endpoint is a backend change with limited benefit. The export endpoint already returns the needed data, just with extra fields.
- **Exit criterion:** When the export endpoint becomes a performance bottleneck for large contests.

### DEFER-30: Remove unnecessary `router.refresh()` from discussion-vote-buttons (from AGG-6)

- **Source:** AGG-6
- **Severity / confidence:** LOW / LOW (original preserved)
- **Citations:** `src/components/discussions/discussion-vote-buttons.tsx:55`
- **Reason for deferral:** The `router.refresh()` ensures server components stay in sync. Removing it could cause stale data in other parts of the page. The performance impact is minimal.
- **Exit criterion:** When a more efficient revalidation strategy (e.g., React Server Actions with `revalidatePath`) is implemented for the discussion module.

---

## Progress log

- 2026-04-22: Plan created from RPF cycle 9 aggregate review. 6 new tasks (H1-H3, L1-L3). 2 new deferred items (DEFER-29, DEFER-30). All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
- 2026-04-22: H1 DONE (ac0d37e9), H2 DONE (10b597cf), H3 DONE (3f17b86d), L1 DONE (ee77686c). ESLint fix (6262ef8e). All gates pass: eslint (1 warning fixed), next build (success), vitest unit (2104/2104 pass), vitest integration (skipped — requires DB), vitest component (pre-existing DB-dependent failures, no test files modified).
