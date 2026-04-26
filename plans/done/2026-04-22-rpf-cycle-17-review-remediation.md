# RPF Cycle 17 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`
**Status:** Complete

## Scope

This cycle addresses findings from the RPF cycle 17 multi-agent review:
- AGG-1: Unguarded `.json()` in 6+ remaining components — migrate to `apiFetchJson` or add `.catch()` guards
- AGG-2: `quick-create-contest-form.tsx` icon-only button missing `aria-label`
- AGG-3: Polling components lack AbortController — systematic pattern gap
- AGG-4: `code-timeline-panel.tsx` timeline navigation buttons lack `aria-label`

No cycle-17 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### M1: Migrate remaining components to `apiFetchJson` or add `.catch()` guards (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM/HIGH
- **Cross-agent signal:** 9 of 11 review perspectives
- **Problem:** 8+ components still use raw `apiFetch` + `res.json()` without `.catch()`. The polling components (contest-clarifications, contest-announcements, contest-quick-stats) are particularly important because silent polling failures mean stale data with no user indication.
- **Plan:**
  1. Migrate `contest-clarifications.tsx` `loadClarifications` to `apiFetchJson`
  2. Migrate `contest-announcements.tsx` `loadAnnouncements` to `apiFetchJson`
  3. Migrate `contest-quick-stats.tsx` `fetchStats` to `apiFetchJson`
  4. Migrate `code-timeline-panel.tsx` `fetchSnapshots` to `apiFetchJson`
  5. Migrate `accepted-solutions.tsx` `load` function to `apiFetchJson`
  6. Add `.catch()` guard to `submission-detail-client.tsx` `pollQueueStatus` (mutation/polling, not a simple GET)
  7. Migrate `discussion-vote-buttons.tsx` to `apiFetchJson` (simplifies the two-call pattern)
  8. Migrate `assignment-form-dialog.tsx` to `apiFetchJson` for the create/update response
  9. Verify all gates pass
- **Status:** Complete

---

### M2: Add `aria-label` to `quick-create-contest-form.tsx` icon-only button (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** LOW/MEDIUM
- **Cross-agent signal:** 4 of 11 review perspectives
- **Citations:** `src/components/contest/quick-create-contest-form.tsx:173`
- **Problem:** The remove problem button uses `variant="ghost" size="sm"` with a `<Trash2>` icon and no visible text. No `aria-label` attribute. Same class of issue fixed in cycles 11-13 and 16.
- **Plan:**
  1. Check if i18n key "removeProblem" exists in the contests.quickCreate namespace
  2. If not, add the i18n key
  3. Add `aria-label={t("removeProblem")}` to the Trash2 button at line 173
  4. Verify all gates pass
- **Status:** Complete

---

### M3: Add AbortController to polling components (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** MEDIUM/MEDIUM
- **Cross-agent signal:** 2 of 11 review perspectives
- **Citations:**
  - `src/components/contest/contest-clarifications.tsx` (30s polling)
  - `src/components/contest/contest-announcements.tsx` (30s polling)
  - `src/components/contest/contest-quick-stats.tsx` (15s polling)
- **Problem:** Three polling components lack AbortController. When the user navigates away, in-flight requests complete unnecessarily. Additionally, stale requests could set state after unmount.
- **Plan:**
  1. Add `useRef<AbortController | null>` to each component
  2. In the fetch callback, abort previous controller before starting new request
  3. Pass `signal: controller.signal` in fetch options
  4. Handle `AbortError` gracefully (don't show toast)
  5. Clean up on unmount
  6. Verify all gates pass
- **Status:** Complete

---

### L1: Add `aria-label` to `code-timeline-panel.tsx` timeline navigation buttons (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW/LOW
- **Cross-agent signal:** 1 of 11 review perspectives
- **Citations:** `src/components/contest/code-timeline-panel.tsx:143-162`
- **Problem:** The previous/next navigation buttons have only icon content (ChevronLeft/ChevronRight) with no `aria-label`. Screen readers announce only "button" without context.
- **Plan:**
  1. Add `aria-label={t("previousSnapshot")}` to the previous button
  2. Add `aria-label={t("nextSnapshot")}` to the next button
  3. Check if i18n keys exist, add if needed
  4. Verify all gates pass
- **Status:** Complete

---

## Deferred items

### DEFER-1 through DEFER-63: All prior deferred items carried forward unchanged

Key items:
- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-24: Invitation URL uses window.location.origin (also SEC-3)
- DEFER-29: Add dedicated candidates summary endpoint for recruiter-candidates-panel
- DEFER-33/SEC-2: Encryption module integrity check / HMAC
- DEFER-50: Encryption module unit tests (from TE-3)
- DEFER-58: Migrate remaining 12+ components to `apiFetchJson` — second wave (now partially addressed by M1)

### DEFER-64: Unit tests for `contest-clarifications.tsx` (from TE-1) [MEDIUM/MEDIUM]

- **Source:** TE-1
- **Severity / confidence:** MEDIUM/MEDIUM (original preserved)
- **Citations:** `src/components/contest/contest-clarifications.tsx`
- **Reason for deferral:** The code fix (M1) addresses the unguarded `.json()`. Adding comprehensive tests for the clarifications component (CRUD, polling, error handling) is a larger effort that should be done in a dedicated test coverage cycle.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-65: Unit tests for `contest-announcements.tsx` (from TE-2) [MEDIUM/MEDIUM]

- **Source:** TE-2
- **Severity / confidence:** MEDIUM/MEDIUM (original preserved)
- **Citations:** `src/components/contest/contest-announcements.tsx`
- **Reason for deferral:** Same as DEFER-64. Code fix (M1) addresses the unguarded `.json()`. Tests are a separate effort.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-66: Unit tests for `contest-quick-stats.tsx` (from TE-3) [LOW/MEDIUM]

- **Source:** TE-3
- **Severity / confidence:** LOW/MEDIUM (original preserved)
- **Citations:** `src/components/contest/contest-quick-stats.tsx`
- **Reason for deferral:** Code fix (M1) addresses the `apiFetchJson` migration. Tests are a separate effort.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-67: Unit tests for `code-timeline-panel.tsx` (from TE-4) [LOW/MEDIUM]

- **Source:** TE-4
- **Severity / confidence:** LOW/MEDIUM (original preserved)
- **Citations:** `src/components/contest/code-timeline-panel.tsx`
- **Reason for deferral:** Code fix (M1) addresses the `apiFetchJson` migration. Tests are a separate effort.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-68: Unit tests for `accepted-solutions.tsx` (from TE-5) [LOW/MEDIUM]

- **Source:** TE-5
- **Severity / confidence:** LOW/MEDIUM (original preserved)
- **Citations:** `src/components/problem/accepted-solutions.tsx`
- **Reason for deferral:** Code fix (M1) addresses the `apiFetchJson` migration. Tests are a separate effort.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-69: Unit tests for `quick-create-contest-form.tsx` (from TE-6) [LOW/MEDIUM]

- **Source:** TE-6
- **Severity / confidence:** LOW/MEDIUM (original preserved)
- **Citations:** `src/components/contest/quick-create-contest-form.tsx`
- **Reason for deferral:** Code fix (M2) addresses the `aria-label`. Tests are a separate effort.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-70: `apiFetchJson` JSDoc example type mismatch with fallback (from DOC-1) [LOW/LOW]

- **Source:** DOC-1
- **Severity / confidence:** LOW/LOW
- **Citations:** `src/lib/api/client.ts:101-110`
- **Reason for deferral:** Minor documentation inconsistency. The example works correctly but the type annotation doesn't include the `total` field that the fallback value provides.
- **Exit criterion:** When `api/client.ts` is next modified for other reasons.

### DEFER-71: Console.error calls in discussion components (from CRI-5) [LOW/LOW]

- **Source:** CRI-5
- **Severity / confidence:** LOW/LOW
- **Citations:**
  - `src/components/discussions/discussion-vote-buttons.tsx:46`
  - `src/components/discussions/discussion-post-form.tsx:47`
  - `src/components/discussions/discussion-thread-form.tsx:53`
  - `src/components/discussions/discussion-post-delete-button.tsx:29`
  - `src/components/discussions/discussion-thread-moderation-controls.tsx:77,97`
- **Reason for deferral:** Minor information disclosure risk. The `console.error` calls log API error codes to the browser console. Not a security concern — the error codes are internal codes like "unauthorized", not sensitive data. Migrating to the `logger` module would be a refactoring effort.
- **Exit criterion:** When discussion components are next modified for other reasons, or when a logging cleanup cycle is scheduled.

### DEFER-72: Loading skeleton for contest-clarifications and contest-announcements (from DES-2, DES-3) [LOW/LOW]

- **Source:** DES-2, DES-3
- **Severity / confidence:** LOW/LOW
- **Citations:**
  - `src/components/contest/contest-clarifications.tsx:217`
  - `src/components/contest/contest-announcements.tsx:199`
- **Reason for deferral:** Visual polish only. The text-only loading state is functional but less polished than the `Skeleton` component used in `leaderboard-table.tsx`. Not a correctness or accessibility issue.
- **Exit criterion:** When either component is next modified for other reasons, or when a UI polish cycle is scheduled.

---

## Progress log

- 2026-04-22: Plan created from RPF cycle 17 aggregate review. 4 new tasks (M1, M2, M3, L1). 9 new deferred items (DEFER-64 through DEFER-72). All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
- 2026-04-22: All 4 tasks completed. M1: Migrated 5 components to apiFetchJson + added .catch() guards to 2 more. M2: Added aria-label to quick-create-contest-form remove button + i18n keys. M3: Added AbortController to 3 polling components. L1: Added aria-label to code-timeline-panel navigation buttons + i18n keys. All component tests updated for apiFetchJson mock. Fixed pre-existing contest-quick-stats test (missing useLocale mock, jitter timing issue).
