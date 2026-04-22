# Critic Review — RPF Cycle 8

**Date:** 2026-04-22
**Reviewer:** critic
**Base commit:** 55ce822b

## Findings

### CRI-1: `comment-section.tsx` handles POST errors inconsistently — `!response.ok` is silently swallowed [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:59-79`

**Description:** The `handleCommentSubmit` function checks `if (response.ok)` on line 70 but has no corresponding `else` branch. When the server returns a non-OK response (403, 413, 500, etc.), the user receives zero feedback. The catch block only handles network errors, not HTTP errors. This is a UX failure — the user types a comment, clicks submit, and nothing visible happens. They may retry, not realizing the first attempt was rejected by the server.

**Concrete failure scenario:** A student writes a long comment that exceeds the server's body size limit. The API returns 413 Payload Too Large. The student sees no error. They think the comment was submitted. They navigate away, losing the comment text.

**Fix:** Add an else branch after the `if (response.ok)` check that shows a toast error.

**Confidence:** HIGH

---

### CRI-2: `participant-anti-cheat-timeline.tsx` polling refresh destroys user's loaded data — UX regression on every 30-second refresh [MEDIUM/HIGH]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:90-108, 129`

**Description:** The anti-cheat timeline uses `useVisibilityPolling` to refresh data every 30 seconds. But `fetchEvents` always calls `setEvents(json.data.events)` which replaces the entire list. If the instructor has loaded multiple pages via `loadMore`, the next polling refresh resets the view. This creates a jarring user experience where the data "jumps back" every 30 seconds.

**Fix:** Make `fetchEvents` merge with existing data or only refresh the first page without clearing loaded data.

**Confidence:** HIGH

---

## Final Sweep

The codebase is in good shape overall. The cycle 7 fixes were properly implemented — the `response.json()` before `response.ok` anti-pattern is now correctly handled in all 5 files that were fixed. The main systemic issues this cycle are: (1) silent error swallowing in `comment-section.tsx`, and (2) the replace-vs-append conflict in the anti-cheat timeline.
