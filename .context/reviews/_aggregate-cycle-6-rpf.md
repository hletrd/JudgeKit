# Aggregate Review — Cycle 6/100 (RPF Run)

**Date:** 2026-05-09
**HEAD:** 75d82a17
**Reviewers:** manual comprehensive pass
**Scope:** Full TypeScript/TSX source review focusing on areas not well-covered in cycles 1-5

---

## Total Deduplicated NEW Findings

**0 HIGH, 1 MEDIUM, 1 LOW**

---

## Findings

### C6-AGG-1: [MEDIUM] SSE JSON parse failure in use-submission-polling.ts leaves `isPolling` stuck true with no fallback polling

**Confidence:** HIGH
**File+line:** `src/hooks/use-submission-polling.ts:136-148`
**Sources:** manual review

In the SSE "result" event handler, if `JSON.parse(event.data)` throws (e.g., server sends malformed JSON), the empty `catch` block at line 144 does NOT call `setIsPolling(false)`. After the catch, `es.close()` and `sseActive = false` run at lines 147-148, but `isPolling` remains `true` in React state.

Because `isPolling` is still true and `submission.status` is still an in-progress status (the parse failed before `setSubmission` could update it), the `useEffect` dependency `isLive` stays true. React does NOT re-run the effect (since `isLive` and `submission.id` haven't changed), so no cleanup runs and no fallback fetch polling starts. The `es.onerror` handler is also never reached because the EventSource itself did not error — the error occurred inside the event handler.

**Concrete failure scenario:** A deployment bug introduces malformed JSON in the SSE stream (e.g., a NaN serialized without quotes, or a control character not escaped). Users viewing submission detail pages see an infinite loading spinner because `isPolling` is true but no actual polling mechanism is active.

**Fix:** In the catch block at line 144, add `setIsPolling(false);` and `setError(true);` to surface the failure to the UI and stop the spinner.

---

### C6-AGG-2: [LOW] locale-switcher.tsx cookie assignment lacks error handling

**Confidence:** MEDIUM
**File+line:** `src/components/layout/locale-switcher.tsx:43`
**Sources:** manual review

`document.cookie = ...` is executed without try/catch. In sandboxed iframe contexts or when cookies are disabled, this can throw a `SecurityError` or `QuotaExceededError`, crashing the component's `setLocale` handler and preventing locale switching.

**Fix:** Wrap the cookie assignment in a try/catch block. On failure, still attempt `window.location.reload()` so the server-side locale handling can take effect.

---

## Areas Verified (No Issues Found)

- All cycle 1-5 fixes remain resolved.
- Timer cleanup correct in all reviewed components (`useVisibilityPolling`, `useSubmissionPolling`, `SubmissionListAutoRefresh`).
- Event listener cleanup correct in all reviewed components (`PublicHeader`, `VimScrollShortcuts`, `LocaleSwitcher`, `ThemeToggle`).
- JSON.parse guards present in all untrusted paths (import, export, chat-widget, anti-cheat).
- `createApiHandler` correctly awaits `routeCtx.params` before passing to handlers.
- `public-footer.tsx` deduplication logic is correct (hardcoded vs CMS links).
- `analytics/route.ts` cycle-5 fixes for thundering-herd and Date.now() staleness check are intact.
- `backup/export-with-files.ts` path traversal checks are in place (cycle-5 fix verified).
- Auth endpoints retain CSRF protection.
- Rate-limiting uses DB-backed time consistently.
- No new SQL injection vectors.
- Korean letter spacing rules respected.
- Stream reader lock release correct in chat-widget and backup export.

---

## Carry-forward DEFERRED items (status unchanged)

All deferred items from prior aggregates remain deferred with unchanged exit criteria. See `_aggregate-cycle-5.md` and `_aggregate-cycle-21.md` for full list.

---

## Cross-agent agreement summary

N/A — manual single-reviewer pass.
