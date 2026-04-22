# Debugger Review — RPF Cycle 8

**Date:** 2026-04-22
**Reviewer:** debugger
**Base commit:** 55ce822b

## Findings

### DBG-1: `comment-section.tsx` — POST comment silently fails on `!response.ok`, user believes comment was not submitted [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:59-79`

**Description:** The `handleCommentSubmit` function checks `response.ok` on line 70 but has no else branch. When the server returns a non-OK response, the function does nothing. The `commentSubmitting` state is reset in the `finally` block, and the comment text remains in the input. But the user has no idea why nothing happened.

**Concrete failure scenario:** A student posts a comment with 2001 characters (exceeding the `maxLength={2000}` on the textarea, but the browser may not enforce this on programmatic submissions). The API returns 400. The student sees no error. They click submit again. Same result. They're confused.

**Fix:** Add an else branch after line 73 with a toast error.

**Confidence:** HIGH

---

### DBG-2: `participant-anti-cheat-timeline.tsx` — polling refresh resets loaded pages, creating a "data disappearing" illusion [MEDIUM/HIGH]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:90-108, 129`

**Description:** The `fetchEvents` function replaces `events` state with only the first page. When `useVisibilityPolling` triggers this every 30 seconds, any events loaded by `loadMore` are discarded. The user sees their data shrink from 150 events to 50, which looks like a bug rather than a refresh.

**Concrete failure scenario:** An instructor reviews 200 anti-cheat events for a participant. They load 3 pages (150 events). They are reading event #127 when the polling refresh fires. The events list resets to 50. The instructor is confused — "where did the other events go?"

**Fix:** Preserve loaded pages when polling refreshes. Only update the first page of data.

**Confidence:** HIGH

---

### DBG-3: `database-backup-restore.tsx` restore path — unnecessary `response.json()` on success could throw SyntaxError [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:150`

**Description:** After a successful restore, line 150 calls `await response.json()` but discards the result. If the restore endpoint returns an empty body (204 No Content with no body, or a non-JSON success response), `response.json()` throws SyntaxError. This would be caught by the catch block on line 156, which shows `toast.error(t("restoreFailed"))` — but the restore actually succeeded. The admin sees a failure toast for a successful restore.

**Fix:** Remove the `await response.json()` call on line 150, or use `.json().catch(() => ({}))` if the intent is to drain the body.

**Confidence:** MEDIUM

---

## Final Sweep

The cycle 7 fixes were properly implemented and verified. The `submission-detail-client.tsx` retry handler now correctly checks `res.ok` before parsing JSON. The anti-cheat timeline's `useVisibilityPolling` integration is functional but has the replace-vs-append conflict. The comment section's silent failure on `!response.ok` is the most impactful new finding.
