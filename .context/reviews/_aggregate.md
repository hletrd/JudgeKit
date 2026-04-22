# RPF Cycle 8 — Aggregate Review

**Date:** 2026-04-22
**Base commit:** 55ce822b
**Review artifacts:** code-reviewer.md, perf-reviewer.md, security-reviewer.md, architect.md, critic.md, verifier.md, debugger.md, test-engineer.md, tracer.md, designer.md, document-specialist.md

## Previously Fixed Items (Verified in Current Code)

All cycle 7 aggregate findings have been addressed. Verified by verifier (V-1):
- AGG-1 from cycle 7 (response.json() before response.ok in 4 remaining files): Fixed in all 4 files
- AGG-2 from cycle 7 (database-backup-restore inconsistent error handling): Fixed — both paths now use `.json().catch(() => ({}))`
- AGG-3 from cycle 7 (admin-config hardcoded "Network error"): Fixed — replaced with `tCommon("error")`
- AGG-4 from cycle 7 (useVisibilityPolling JSDoc missing callback error note): Fixed
- AGG-5 from cycle 7 (submission-detail-client retry refresh): Fixed — checks `res.ok` before `.json()`

## Deduped Findings (sorted by severity then signal)

### AGG-1: `comment-section.tsx` silently swallows `!response.ok` on POST — no user feedback on failed comment submission [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-2), architect (ARCH-1), critic (CRI-1), verifier (V-2), debugger (DBG-1), tracer (TR-1), designer (DES-1), document-specialist (DOC-1)
**Signal strength:** 9 of 11 review perspectives

**Files:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:59-79`

**Description:** The `handleCommentSubmit` function checks `if (response.ok)` on line 70 but has no else branch. When the server returns a non-OK response (403, 413, 500, etc.), the user receives zero feedback — no toast, no inline error. The catch block only handles network errors. The comment text remains in the input, but the user has no indication the submission failed.

**Concrete failure scenario:** A student submits a comment. The API returns 403 (their comment permission was revoked). `response.ok` is false, the if-block is skipped, `finally` resets `commentSubmitting`. Student sees no error. They think the comment was not submitted. They may retry repeatedly.

**Fix:** Add an else branch after line 73 that shows a toast error, e.g., `toast.error(tComments("submitError"))`.

---

### AGG-2: `participant-anti-cheat-timeline.tsx` polling refresh replaces entire event list — discards pages loaded by `loadMore` [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-2), perf-reviewer (PERF-1), architect (ARCH-2), critic (CRI-2), verifier (V-3), debugger (DBG-2), tracer (TR-2), designer (DES-2)
**Signal strength:** 8 of 11 review perspectives

**Files:** `src/components/contest/participant-anti-cheat-timeline.tsx:90-108, 129`

**Description:** The `fetchEvents` function (called by `useVisibilityPolling` every 30 seconds) always fetches from offset 0 and calls `setEvents(json.data.events)`, which replaces the entire events array. The `loadMore` function appends events with `setEvents((prev) => [...prev, ...json.data.events])`. When the next polling refresh fires after the user has loaded additional pages, those pages are discarded. The user sees their data "shrink" back to the first page.

**Concrete failure scenario:** An instructor views anti-cheat events for a participant with 200 events. They click "Load More" twice to see 150 events. 30 seconds later, the polling refresh fires `fetchEvents`, which resets `events` to the first 50. The instructor loses their expanded view and scroll position.

**Fix:** When events already loaded exceed the first page, preserve the additional pages during refresh. Only update the first page of data. Or skip the replace if the first page data is unchanged.

---

### AGG-3: `database-backup-restore.tsx` restore path calls `response.json()` unnecessarily on success — can throw SyntaxError on non-JSON body [LOW/LOW]

**Flagged by:** code-reviewer (CR-4), security-reviewer (SEC-3), architect (ARCH-3), debugger (DBG-3), tracer (TR-3), designer (DES-3), document-specialist (DOC-2)
**Signal strength:** 7 of 11 review perspectives

**Files:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:150`

**Description:** After a successful restore, line 150 calls `await response.json()` but discards the result. If the restore endpoint returns a non-JSON body (e.g., empty 200), `response.json()` throws SyntaxError. The catch block shows "restore failed" even though the restore succeeded. The result is also dead code.

**Fix:** Remove the `await response.json()` call on line 150, or use `.json().catch(() => ({}))` if the intent is to drain the body.

---

### AGG-4: `assignment-form-dialog.tsx` `Number(event.target.value)` for latePenalty can produce NaN [LOW/LOW]

**Flagged by:** code-reviewer (CR-5)
**Signal strength:** 1 of 11 review perspectives

**Files:** `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:407`

**Description:** `setLatePenalty(Number(event.target.value))` can produce `NaN` if the input contains certain characters. While `<input type="number">` normally prevents this, `Number("e")` returns `NaN`. The `min`/`max` attributes only prevent form submission, not the onChange event.

**Fix:** Use `parseFloat(event.target.value) || 0` or validate before setting state.

---

### AGG-5: `submission-overview.tsx` continues polling even when dialog is closed [LOW/LOW]

**Flagged by:** code-reviewer (CR-3), perf-reviewer (PERF-2)
**Signal strength:** 2 of 11 review perspectives

**Files:** `src/components/lecture/submission-overview.tsx:123`

**Description:** `useVisibilityPolling` runs continuously with a 5-second interval even when the dialog is closed. The `fetchStats` callback has a ref-based guard that prevents the actual API call, but `setTimeout` scheduling still occurs every 5 seconds.

**Fix:** Conditionally enable/disable the polling based on the `open` prop.

---

## Previously Deferred Items (Carried Forward)

From prior cycles:
- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-2: SSE connection tracking eviction optimization
- DEFER-3: SSE connection cleanup test coverage
- D1: JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2: JWT callback DB query on every request — add TTL cache (MEDIUM)
- A19: `new Date()` clock skew risk in remaining routes (LOW)
- DEFER-20: Contest clarifications show raw userId instead of username
- DEFER-21: Duplicated visibility-aware polling pattern (partially addressed)
- DEFER-22: copyToClipboard dynamic import inconsistency
- DEFER-23: Practice page Path B progress filter
- DEFER-24: Invitation URL uses window.location.origin (SEC-1 also flagged access-code-manager, workers-client, and now file-management-client)
- DEFER-25: Duplicate formatTimestamp utility
- DEFER-1 (cycle 1): Add unit tests for useVisibilityPolling, SubmissionListAutoRefresh, and stats endpoint
- DEFER-2 (cycle 1): Standardize error handling pattern in useVisibilityPolling

## Agent Failures

None. All 11 review perspectives completed successfully.
