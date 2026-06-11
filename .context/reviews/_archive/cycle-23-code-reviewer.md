# Cycle 23 Code Reviewer

**Date:** 2026-04-20
**Base commit:** bb6f3fc2

## Findings

### CR-1: `countdown-timer.tsx` uses raw `fetch()` instead of `apiFetch` [MEDIUM/HIGH]

**Files:** `src/components/exam/countdown-timer.tsx:76`
**Description:** The `CountdownTimer` component calls `fetch("/api/v1/time", ...)` directly instead of using the centralized `apiFetch` wrapper. The cycle-22 H1 fix migrated all client-side `fetch()` calls in admin and plugin components, but this exam component was missed because the audit only covered `src/lib/plugins/` and `src/app/(dashboard)/dashboard/admin/`. While the `/api/v1/time` endpoint is GET (safe method, not CSRF-gated), the principle of centralized CSRF protection still applies: if `apiFetch` gains additional security headers in the future (e.g., `X-CSRF-Token`), this call site will not benefit. More importantly, it is the only remaining client-side raw `fetch()` in a `.tsx` file, creating an inconsistency.
**Concrete failure scenario:** A future enhancement adds a `X-CSRF-Token` header to `apiFetch` for double-submit CSRF. The `/api/v1/time` endpoint continues to work but deviates from the project's security convention, and a developer later adds a POST call to a similar timer endpoint using the same raw `fetch` pattern as a template.
**Fix:** Replace `fetch("/api/v1/time", ...)` with `apiFetch("/api/v1/time", ...)`.
**Confidence:** HIGH

### CR-2: `contest-quick-stats.tsx` silently swallows fetch errors [LOW/MEDIUM]

**Files:** `src/components/contest/contest-quick-stats.tsx:76-78`
**Description:** The `fetchStats` callback has a `catch` block that contains only `// ignore`. While the stats are supplementary display data and a failure is non-critical, the `apiFetch` convention (documented in `src/lib/api/client.ts`) states "Never silently swallow errors -- always surface them to the user." Other contest components (clarifications, announcements) properly show toast errors on fetch failure. This is inconsistent.
**Concrete failure scenario:** A contest admin's network has intermittent issues. The quick stats silently show stale/zero values with no indication that the data may be outdated. The admin thinks no one has submitted.
**Fix:** Add `toast.error(t("fetchError"))` in the catch block (or a more specific i18n key), matching the pattern in contest-clarifications and contest-announcements.
**Confidence:** MEDIUM

### CR-3: `leaderboard-table.tsx` interval fires even on hidden tabs [LOW/LOW]

**Files:** `src/components/contest/leaderboard-table.tsx:245-246`
**Description:** The leaderboard's `useEffect` creates a `setInterval` that fires every `refreshInterval` ms (default 30s). Inside the callback, it checks `document.visibilityState === "visible"` before making the request. This is a half-measure: the interval still fires, consuming CPU for the timer tick and callback execution, even though the API call is skipped. The contest-clarifications, contest-announcements, contest-quick-stats, and workers-client components all properly pause/resume the interval itself based on visibility.
**Concrete failure scenario:** A user has a contest leaderboard tab open in the background. Every 30 seconds, the interval fires, the visibility check evaluates to "hidden", and the fetch is skipped -- but the timer continues ticking unnecessarily.
**Fix:** Refactor to pause/resume the interval on visibility change, matching the pattern used in `contest-clarifications.tsx`.
**Confidence:** LOW

### CR-4: `anti-cheat-monitor.tsx` `savePendingEvents` silently swallows localStorage write failures [LOW/LOW]

**Files:** `src/components/exam/anti-cheat-monitor.tsx:43-45`
**Description:** The `savePendingEvents` function has an empty `catch` block with the comment `// localStorage unavailable`. While this is a reasonable defense against private-browsing quota errors, the failure is completely invisible. If localStorage consistently fails, the anti-cheat system silently loses all pending events after retries are exhausted, with no indication to the user or monitoring system.
**Concrete failure scenario:** A student is in an exam. Their browser has a corrupted localStorage that silently fails writes. The anti-cheat events are generated but never persisted. After a network interruption, all pending events are lost instead of being retried.
**Fix:** Log the failure in development mode at minimum (`if (process.env.NODE_ENV === "development") console.warn(...)`). Consider also tracking a "localStorageFailed" flag to prevent repeated write attempts.
**Confidence:** LOW

## Verified Safe

- All `tracking-*` classes are properly conditional on `locale !== "ko"`, fully compliant with CLAUDE.md.
- No `as any` casts found in source code.
- No `innerHTML` assignments; only `dangerouslySetInnerHTML` with proper sanitization (DOMPurify + `safeJsonForScript`).
- `sanitizeHtml` uses strict tag/attribute allowlists and URI regexp blocking.
- All client-side API calls in contest components use `apiFetch`.
- The `formatNumber` deprecated re-export from `datetime.ts` has been successfully removed.
- `apiFetch` now has unit tests covering header injection, preservation, and deduplication.
