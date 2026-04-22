# UI/UX Review — RPF Cycle 8

**Date:** 2026-04-22
**Reviewer:** designer
**Base commit:** 55ce822b

## Findings

### DES-1: `comment-section.tsx` gives no feedback on failed comment submission — violates form UX principle [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:59-79`

**Description:** When a comment POST returns a non-OK response, the user sees no error feedback. This violates the fundamental UX principle that every user action should receive feedback. The submit button is re-enabled (via `setCommentSubmitting(false)`), but no toast or inline error is shown. The user may believe the comment was submitted or may be confused about why nothing happened.

**Fix:** Add a toast error in an else branch after the `if (response.ok)` check. Use the appropriate i18n key.

**Confidence:** HIGH

---

### DES-2: `participant-anti-cheat-timeline.tsx` events "disappear" on polling refresh — poor perceived stability [MEDIUM/MEDIUM]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:90-108, 129`

**Description:** When the anti-cheat timeline polls for updates every 30 seconds, it replaces the event list with only the first page. If the user has loaded additional pages, those events visually "disappear." This creates a jarring, unstable UX where content unexpectedly vanishes. The user may think the data was deleted or there is a bug.

**Fix:** Preserve loaded pages during polling refresh. Only update the first page of data or use a merge strategy.

**Confidence:** HIGH

---

### DES-3: `database-backup-restore.tsx` restore path shows "restore failed" toast on success if server returns non-JSON body [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:150`

**Description:** The unnecessary `await response.json()` call on line 150 could throw SyntaxError if the server returns a non-JSON success body. The catch block would show "Restore failed" even though the restore succeeded. This is confusing UX for an admin-level destructive operation.

**Fix:** Remove the unnecessary `response.json()` call or add a `.catch()` guard.

**Confidence:** LOW

---

## Final Sweep

The UI components generally follow the project's design system. The contest clarifications and announcements components have proper loading, empty, and error states. The comment section has good structure but the missing error feedback is a UX gap. The anti-cheat timeline's pagination is well-implemented but conflicts with the polling refresh pattern.
