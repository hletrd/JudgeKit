# Code Quality Review — RPF Cycle 8

**Date:** 2026-04-22
**Reviewer:** code-reviewer
**Base commit:** 55ce822b

## Findings

### CR-1: `comment-section.tsx` silently swallows error responses — `response.ok` check passes but `response.json()` can still fail [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:43-49`

**Description:** The `fetchComments` function checks `if (response.ok)` then calls `response.json()`, but if `response.json()` throws (e.g., truncated JSON from a proxy timeout), the error is caught by the generic `catch` block which shows a toast. However, the `handleCommentSubmit` function (line 64-79) checks `if (response.ok)` on line 70 but does NOT show any error feedback when `response.ok` is false. The user submits a comment, the server returns an error (e.g., 403 forbidden), and the comment is silently lost — no toast, no feedback.

**Concrete failure scenario:** A student submits a comment on a submission. The API returns 403 (they lost comment permission). `response.ok` is false, the code enters the `if (response.ok)` branch which is empty, does nothing. The comment text is NOT cleared (no `setCommentContent("")`), but the user gets no feedback that the submission failed.

**Fix:** Add an `else` branch to the `response.ok` check in `handleCommentSubmit` that shows a toast error, similar to the catch block.

**Confidence:** HIGH

---

### CR-2: `participant-anti-cheat-timeline.tsx` `loadMore` resets the event list on polling refresh [MEDIUM/HIGH]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:90-108, 129`

**Description:** The `fetchEvents` function (line 90) always fetches from offset 0 and replaces `events` state with `setEvents(json.data.events)`. It is called by `useVisibilityPolling` on line 129 every 30 seconds. When a user has scrolled and loaded more events via `loadMore` (which appends to events), the next polling refresh will reset the list back to only the first page. The user's expanded view is lost.

**Concrete failure scenario:** An instructor views the anti-cheat timeline for a participant with 200 events. They click "Load More" twice to see 150 events. 30 seconds later, the polling refresh fires `fetchEvents`, which resets `events` to the first 50. The instructor loses their scroll position and the expanded data.

**Fix:** In `fetchEvents`, when `events.length > PAGE_SIZE`, use a diff/merge strategy instead of replacing. Or at minimum, do not reset if the user has already loaded more data.

**Confidence:** HIGH

---

### CR-3: `submission-overview.tsx` fetches data even when the dialog is closed — `openRef` guard may be stale [LOW/MEDIUM]

**File:** `src/components/lecture/submission-overview.tsx:72-74, 123`

**Description:** The `fetchStats` callback checks `openRef.current` before fetching, which is a ref-based guard. The `useVisibilityPolling` hook on line 123 calls the callback every 5 seconds regardless of whether the dialog is open. The ref guard should work, but there is a race: `useVisibilityPolling` schedules a `setTimeout`, and the callback reference is captured at callback creation time. The ref is always up-to-date since refs are mutable, but the polling continues to fire `setTimeout` calls even when the dialog is closed, which is wasteful.

**Fix:** Pass the `open` state to `useVisibilityPolling` and have it skip scheduling when the dialog is closed, or use a conditional hook pattern.

**Confidence:** LOW

---

### CR-4: `database-backup-restore.tsx` restore path calls `response.json()` unnecessarily on success [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:150`

**Description:** After a successful restore (line 149-150), the code calls `await response.json()` but discards the result. This is unnecessary I/O — the server may return an empty body or a confirmation object, but neither is used. This is a minor inefficiency.

**Fix:** Remove the `await response.json()` call on line 150, or use it if the server returns useful data.

**Confidence:** LOW

---

### CR-5: `assignment-form-dialog.tsx` `Number(event.target.value)` for latePenalty can produce NaN [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:407`

**Description:** `setLatePenalty(Number(event.target.value))` can produce `NaN` if the input contains non-numeric characters. While `<input type="number">` normally prevents this, the `value` can be an empty string when the user clears the field. `Number("")` returns `0`, which is acceptable, but if the user types "e" (allowed in number inputs for scientific notation in some browsers), `Number("e")` returns `NaN`. The `min`/`max` attributes only prevent form submission, not the onChange event. NaN would be sent to the API.

**Fix:** Use `parseFloat(event.target.value) || 0` or validate before setting state.

**Confidence:** LOW

---

## Final Sweep

The cycle 7 fixes for the `response.json()` before `response.ok` pattern are all correctly implemented. The 5 files fixed in cycle 7 (`create-group-dialog.tsx`, `bulk-create-dialog.tsx`, `database-backup-restore.tsx`, `admin-config.tsx`, `submission-detail-client.tsx`) now properly check `response.ok` before parsing JSON. The main new finding is the silent failure in `comment-section.tsx` where `!response.ok` gives no user feedback.
