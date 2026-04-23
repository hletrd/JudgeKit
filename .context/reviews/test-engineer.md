# Test Engineer Review — RPF Cycle 24

**Date:** 2026-04-22
**Base commit:** dbc0b18f

## TE-1: No unit tests for `handleBulkAddMembers` double `.json()` pattern [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:181-185`

**Description:** The `handleBulkAddMembers` function has the same double `.json()` anti-pattern that was fixed in `handleAddMember` but lacks test coverage that would catch this class of issue.

**Fix:** Add a test that verifies the response body is only consumed once.

---

## TE-2: No tests verifying raw error messages are not leaked in discussion components [LOW/LOW]

**Files:**
- `src/components/discussions/discussion-post-form.tsx`
- `src/components/discussions/discussion-thread-form.tsx`
- `src/components/discussions/discussion-post-delete-button.tsx`
- `src/components/discussions/discussion-thread-moderation-controls.tsx`

**Description:** No tests verify that unexpected errors (e.g., SyntaxError from `.json()`) do not leak raw messages through toasts.

**Fix:** Add integration tests that verify toast messages contain only i18n labels.

---

## Summary

- LOW: 2 (TE-1, TE-2)
- Total new findings: 2
