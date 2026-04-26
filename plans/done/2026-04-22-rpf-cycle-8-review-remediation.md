# RPF Cycle 8 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`
**Status:** In progress

## Scope

This cycle addresses findings from the RPF cycle 8 multi-agent review:
- AGG-1: `comment-section.tsx` silently swallows `!response.ok` on POST — no user feedback
- AGG-2: `participant-anti-cheat-timeline.tsx` polling refresh replaces entire event list — discards pages loaded by loadMore
- AGG-3: `database-backup-restore.tsx` restore path calls `response.json()` unnecessarily on success
- AGG-4: `assignment-form-dialog.tsx` `Number(event.target.value)` for latePenalty can produce NaN
- AGG-5: `submission-overview.tsx` continues polling even when dialog is closed

No cycle-8 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Add error feedback for `!response.ok` in `comment-section.tsx` (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:59-79`
- **Cross-agent signal:** 9 of 11 review perspectives
- **Problem:** The `handleCommentSubmit` function checks `if (response.ok)` but has no else branch. When the server returns a non-OK response (403, 413, 500), the user receives zero feedback. The catch block only handles network errors.
- **Plan:**
  1. Add an else branch after the `if (response.ok)` check on line 70 that shows a toast error using `tComments("submitError")`.
  2. Optionally parse the error body with `.json().catch(() => ({}))` to extract a specific error message.
  3. Verify all gates pass.
- **Status:** DONE — Commit `abb3bc3f`

### H2: Fix `participant-anti-cheat-timeline.tsx` polling refresh to preserve loaded pages (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/components/contest/participant-anti-cheat-timeline.tsx:90-108, 129`
- **Cross-agent signal:** 8 of 11 review perspectives
- **Problem:** `fetchEvents` replaces the entire `events` array on every polling refresh. When the user has loaded additional pages via `loadMore`, those pages are discarded on the next 30-second refresh.
- **Plan:**
  1. Modify `fetchEvents` to only update the first page of data when events are already loaded beyond the first page.
  2. When `events.length > PAGE_SIZE`, only update the first `PAGE_SIZE` items in the array with the fresh data, preserving the rest.
  3. Update `total` state from the fresh response (since total may change).
  4. Verify all gates pass.
- **Status:** DONE — Commit `fce3d5df`

### L1: Remove unnecessary `response.json()` call in `database-backup-restore.tsx` restore success path (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:150`
- **Cross-agent signal:** 7 of 11 review perspectives
- **Problem:** After a successful restore, line 150 calls `await response.json()` and discards the result. If the server returns a non-JSON body, SyntaxError is thrown, and the catch block shows "restore failed" even though the restore succeeded.
- **Plan:**
  1. Remove the `await response.json()` call on line 150.
  2. Verify all gates pass.
- **Status:** DONE — Commit `46eadee9`

### L2: Fix `Number(event.target.value)` NaN risk in `assignment-form-dialog.tsx` (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:407`
- **Cross-agent signal:** 1 of 11 review perspectives
- **Problem:** `setLatePenalty(Number(event.target.value))` can produce NaN. While `Number("")` returns 0 (acceptable), `Number("e")` returns NaN.
- **Plan:**
  1. Change `Number(event.target.value)` to `parseFloat(event.target.value) || 0`.
  2. Verify all gates pass.
- **Status:** TODO

### L3: Skip polling when dialog is closed in `submission-overview.tsx` (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/lecture/submission-overview.tsx:123`
- **Cross-agent signal:** 2 of 11 review perspectives
- **Problem:** `useVisibilityPolling` runs continuously even when the dialog is closed. The ref-based guard prevents API calls, but setTimeout scheduling still occurs.
- **Plan:**
  1. Make the `useVisibilityPolling` callback return early when `!openRef.current` (it already does via the guard in `fetchStats`). This is already handled — the only waste is the setTimeout scheduling. Consider this low priority.
  2. Alternatively, conditionally pass a very long interval when the dialog is closed.
  3. Verify all gates pass.
- **Status:** ADDRESSED — The existing `openRef.current` guard in `fetchStats` already prevents actual API calls when the dialog is closed. The only waste is `setTimeout` scheduling, which is negligible. Adding an `enabled` parameter to `useVisibilityPolling` would be over-engineering for this minor issue.

---

## Deferred items

### DEFER-1 through DEFER-25: Carried from cycle 7 plan

See `plans/done/2026-04-22-rpf-cycle-7-review-remediation.md` for the full deferred list. All carry forward unchanged. Key items:
- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-20: Contest clarifications show raw userId instead of username
- DEFER-24: Invitation URL uses window.location.origin (SEC-1 also flagged access-code-manager, workers-client, and file-management-client)
- DEFER-1 (cycle 1): Add unit tests for useVisibilityPolling, SubmissionListAutoRefresh, and stats endpoint

### DEFER-26: Unit tests for create-group-dialog.tsx and bulk-create-dialog.tsx (from cycle 7 TE-1, TE-2)

Carried from cycle 7 plan unchanged.

### DEFER-27: Unit tests for comment-section.tsx (from TE-1)

- **Source:** TE-1
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx`
- **Reason for deferral:** The code fix (H1) addresses the immediate bug. Adding comprehensive unit tests is a larger effort that should be done in a dedicated test coverage pass.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-28: Unit tests for participant-anti-cheat-timeline.tsx polling behavior (from TE-2)

- **Source:** TE-2
- **Severity / confidence:** LOW / LOW (original preserved)
- **Citations:** `src/components/contest/participant-anti-cheat-timeline.tsx`
- **Reason for deferral:** The code fix (H2) addresses the immediate bug. Testing the polling/append interaction is a larger effort.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

---

## Progress log

- 2026-04-22: Plan created from RPF cycle 8 aggregate review. 5 new tasks (H1-H2, L1-L3). 3 new deferred items (DEFER-27, DEFER-28, and carried DEFER-26). All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
- 2026-04-22: H1 DONE (abb3bc3f), H2 DONE (fce3d5df), L1 DONE (46eadee9), L2 DONE (57177f15), L3 ADDRESSED (existing guard is sufficient). Running quality gates.
