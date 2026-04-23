# Debugger Review — RPF Cycle 24

**Date:** 2026-04-22
**Base commit:** dbc0b18f

## DBG-1: `handleBulkAddMembers` double `.json()` — same anti-pattern fixed in `handleAddMember` but missed here [HIGH/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:181-185`

**Description:** The `handleAddMember` function in the same file was fixed in cycle 23 to parse the body once before branching. But `handleBulkAddMembers` (lines 163-209) was not updated. This is likely an oversight — the fix was applied to the first handler but the second handler in the same file was missed.

**Failure mode:** If someone refactors the error handling in `handleBulkAddMembers` to not throw, the second `.json()` call on line 185 will throw `TypeError: Body has already been consumed`.

**Fix:** Apply the same parse-once-before-branching pattern used in `handleAddMember`.

---

## DBG-2: Discussion components show raw error messages — hidden by throw pattern [MEDIUM/MEDIUM]

**Files:**
- `src/components/discussions/discussion-post-form.tsx:54`
- `src/components/discussions/discussion-thread-form.tsx:61`
- `src/components/discussions/discussion-post-delete-button.tsx:36`
- `src/components/discussions/discussion-thread-moderation-controls.tsx:83,104`

**Description:** The pattern `toast.error(error instanceof Error ? error.message : errorLabel)` seems safe because the code throws `new Error(errorLabel)` just before. But the catch block catches ALL errors, not just the thrown one. If `response.json().catch(() => ({}))` somehow fails to catch (edge case: the `.catch` handler itself throws), a SyntaxError would propagate to the catch block and its raw message would be shown to the user.

**Fix:** Always use i18n label in toast, log raw errors to console.

---

## Summary

- HIGH: 1 (DBG-1)
- MEDIUM: 1 (DBG-2)
- Total new findings: 2
