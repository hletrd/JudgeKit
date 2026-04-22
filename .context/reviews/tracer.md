# Tracer Review — RPF Cycle 8

**Date:** 2026-04-22
**Reviewer:** tracer
**Base commit:** 55ce822b

## Findings

### TR-1: Causal trace of `comment-section.tsx` POST failure — `!response.ok` path leads to silent user experience [MEDIUM/MEDIUM]

**Trace path:** `handleCommentSubmit` -> `apiFetch("/api/v1/submissions/${submissionId}/comments", {method: "POST"})` -> server returns 403 -> `response.ok` is false -> if-block on line 70 skipped -> no else branch -> falls to `finally` block -> `setCommentSubmitting(false)` -> user sees no feedback

**Description:** The comment submission has two error paths: (1) network error caught by catch block, which shows a toast, and (2) HTTP error (!response.ok), which is silently swallowed. The two paths should behave identically from the user's perspective.

**Fix:** Add an else branch after the `if (response.ok)` check on line 70 that shows a toast error.

**Confidence:** HIGH

---

### TR-2: Causal trace of anti-cheat timeline polling reset — `fetchEvents` called by `useVisibilityPolling` replaces `events` state [MEDIUM/HIGH]

**Trace path:** `useVisibilityPolling` timer fires -> `fetchEvents()` called -> `apiFetch` returns page 1 data -> `setEvents(json.data.events)` replaces entire array -> previously loaded pages 2+ are discarded -> user's scroll position and expanded rows are lost

**Description:** The component has two state mutations for events: `setEvents(json.data.events)` (replace) and `setEvents((prev) => [...prev, ...json.data.events])` (append). The replace mutation in `fetchEvents` is correct for the initial load but incorrect for subsequent refreshes when more pages have been loaded.

**Fix:** When events already has more items than the first page, preserve the additional items during refresh.

**Confidence:** HIGH

---

### TR-3: Causal trace of `database-backup-restore.tsx` restore success with non-JSON body — SyntaxError on success path [LOW/LOW]

**Trace path:** `handleRestore` -> `apiFetch("/api/v1/admin/restore", {method: "POST"})` -> server returns 200 with empty body -> `await response.json()` on line 150 throws SyntaxError -> catch block on line 156 shows `toast.error(t("restoreFailed"))` -> admin sees failure toast even though restore succeeded

**Description:** If the restore endpoint returns a 200 with a non-JSON body, line 150's `response.json()` throws SyntaxError. The catch block shows a "restore failed" toast, but the restore actually succeeded. This is a low-probability scenario since the endpoint likely returns JSON, but the dead code is a latent bug.

**Fix:** Remove the `await response.json()` call or use `.json().catch(() => ({}))`.

**Confidence:** MEDIUM

---

## Final Sweep

The prior cycle fixes were properly traced and verified. The main tracing concern this cycle is the two silent failure paths: comment-section's `!response.ok` and the anti-cheat timeline's polling reset.
