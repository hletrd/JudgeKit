# Architectural Review — RPF Cycle 8

**Date:** 2026-04-22
**Reviewer:** architect
**Base commit:** 55ce822b

## Findings

### ARCH-1: `comment-section.tsx` has asymmetric error handling between fetch and submit — fetch shows toast on error but submit silently swallows `!response.ok` [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:41-53 vs 59-79`

**Description:** The `fetchComments` function (line 41-53) properly shows a toast on error. The `handleCommentSubmit` function (line 59-79) checks `response.ok` on line 70 but has no else branch — when `!response.ok`, it does nothing. The user gets no feedback. This is an architectural inconsistency in error handling within the same component.

**Fix:** Add an `else` branch after line 73 to show a toast error when `!response.ok`, following the same pattern as the catch block.

**Confidence:** HIGH

---

### ARCH-2: `participant-anti-cheat-timeline.tsx` `fetchEvents` replaces state on every poll — contradicts the incremental loading pattern established by `loadMore` [MEDIUM/HIGH]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:90-108`

**Description:** The component implements two patterns: (1) `fetchEvents` replaces the entire event list, and (2) `loadMore` appends to the list. These patterns are architecturally in conflict. When `useVisibilityPolling` triggers `fetchEvents`, it resets the list to the first page, undoing any `loadMore` expansions. The component's two data-fetching strategies are inconsistent — one is replace, the other is append.

**Fix:** Make `fetchEvents` preserve already-loaded pages when refreshing. Only replace the first page of data (which is what the server returns for offset=0), and keep any additional pages loaded by `loadMore`.

**Confidence:** HIGH

---

### ARCH-3: `database-backup-restore.tsx` restore path calls `response.json()` without using result — dead code [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:150`

**Description:** Line 150 `await response.json()` is called after a successful restore but the result is discarded. This is dead code that suggests either: (1) the response was originally used but the usage was removed, or (2) it was added to drain the response body. If the intent is to drain the body, `response.text()` or `response.body?.cancel()` would be more appropriate.

**Fix:** Remove the dead `await response.json()` call or document its purpose.

**Confidence:** HIGH

---

## Final Sweep

The auth layer, CSRF protection, and permission system remain well-layered. The `useVisibilityPolling` hook provides a good shared abstraction. The Docker execution sandbox has proper defense-in-depth. The rate-limiter circuit breaker correctly fails open. The cycle 7 `response.json()` before `response.ok` fixes are properly implemented. The main new architectural issue is the conflicting replace/append patterns in the anti-cheat timeline.
