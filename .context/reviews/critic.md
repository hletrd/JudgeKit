# Critic Review — RPF Cycle 24

**Date:** 2026-04-22
**Base commit:** dbc0b18f

## CRI-1: Error message display inconsistency — some components leak raw errors, others use i18n [MEDIUM/MEDIUM]

**Files:**
- `src/components/discussions/discussion-post-form.tsx:54`
- `src/components/discussions/discussion-thread-form.tsx:61`
- `src/components/discussions/discussion-post-delete-button.tsx:36`
- `src/components/discussions/discussion-thread-moderation-controls.tsx:83,104`
- `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:102`

**Description:** There is an inconsistency in error handling across the codebase. Some components properly use i18n labels in error toasts (e.g., contest-join-client, recruiting-invitations-panel), while others fall through to displaying raw `error.message`. The `src/lib/api/client.ts` convention is clear: "Use i18n keys for all user-facing error messages." But the convention is not uniformly followed.

The discussion components use `toast.error(error instanceof Error ? error.message : errorLabel)`. While `error.message` happens to be the i18n label in the normal error path (because the code throws `new Error(errorLabel)`), this is fragile — any unexpected error will leak its raw message.

**Fix:** Standardize all catch blocks to always use i18n labels in toasts. Log raw errors to console for debugging.

---

## CRI-2: `handleBulkAddMembers` double `.json()` — regression risk [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:181-185`

**Description:** The `handleAddMember` function was fixed in cycle 23 to parse the body once before branching. But `handleBulkAddMembers` in the same file still uses the old double `.json()` pattern. This inconsistency suggests the fix was applied narrowly rather than comprehensively within a single file.

**Fix:** Apply the same parse-once pattern to `handleBulkAddMembers`.

---

## Summary

- MEDIUM: 2 (CRI-1, CRI-2)
- Total new findings: 2
