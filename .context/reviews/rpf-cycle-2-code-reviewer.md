# RPF Cycle 2 — Code Reviewer

**Date:** 2026-04-22
**Base commit:** 14218f45

## Findings

### CR-1: `recruiting-invitations-panel.tsx` uses `new Date().toISOString()` for custom expiry date `min` attribute — timezone mismatch risk [MEDIUM/HIGH]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:407`
**Description:** The custom expiry date input uses `min={new Date().toISOString().split("T")[0]}` to prevent selecting past dates. However, `toISOString()` returns UTC time, while the native `<input type="date">` renders in the user's local timezone. A user in UTC+9 (Korea) at 2 AM local time on April 22 would see `2026-04-21` as the UTC date, making April 22 unavailable as a minimum even though it's the current local date. The user would be forced to pick April 23 or later, which is incorrect.
**Concrete failure scenario:** Korean user at 1:30 AM on April 22 tries to set a custom expiry date. The `min` attribute is set to `2026-04-21` (UTC), but the browser renders in local time, so April 22 is the current date. However, the reverse problem also exists: a user in UTC-5 at 11 PM on April 21 would see `min=2026-04-22` (UTC), preventing them from selecting April 21 even though it's still their current local date.
**Fix:** Use local date formatting: `new Date().toLocaleDateString('sv-SE')` or `new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]`.

### CR-2: `SubmissionListAutoRefresh` has no error handling or exponential backoff on `router.refresh()` failures [MEDIUM/MEDIUM]

**File:** `src/components/submission-list-auto-refresh.tsx:24-28`
**Description:** The component calls `router.refresh()` on a fixed interval without any error handling. If the server is overloaded or returning errors, the component will continue hammering it at the same rate. Unlike the fetch-based polling in `use-submission-polling.ts` (which has exponential backoff), this component has no such protection. This was flagged as AGG-9 in cycle 1 but at LOW/LOW — upgrading to MEDIUM because in production during judging contests with many concurrent users, this creates a compounding load problem.
**Concrete failure scenario:** During a large contest, the server starts returning 502 errors. Every active browser tab with the submission list continues polling at 5-10 second intervals, creating a thundering herd that delays recovery.
**Fix:** Add error-state tracking with exponential backoff, similar to `initFetchPolling` in `use-submission-polling.ts`.

### CR-3: `contest-clarifications.tsx` shows raw `userId` instead of username for other users' clarifications [LOW/MEDIUM]

**File:** `src/components/contest/contest-clarifications.tsx:257`
**Description:** When displaying who asked a clarification, the code shows `clarification.userId` (a raw UUID) for other users' questions, and `t("askedByMe")` for the current user's own questions. This is a poor UX — participants see meaningless UUIDs. This was deferred as DEFER-20 in the cycle 28 plan.
**Fix:** Backend API needs to include `userName` in the clarifications response. Frontend should display the resolved name.

### CR-4: `workers-client.tsx` polling interval is not paused when tab is hidden on initial mount [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:249`
**Description:** The `setInterval(fetchData, 10_000)` is started immediately on mount regardless of visibility state. If the admin opens the workers page in a background tab, it will start polling immediately. The visibility handler later clears the interval, but there's a brief window where background polling occurs. This is a minor issue.
**Fix:** Check `document.visibilityState` before starting the initial interval.

### CR-5: Duplicate `formatTimestamp` utility across `contest-clarifications.tsx` and `contest-announcements.tsx` [LOW/LOW]

**Files:** `src/components/contest/contest-clarifications.tsx:39-47`, `src/components/contest/contest-announcements.tsx:29-37`
**Description:** Both components define identical `formatTimestamp` functions. The project already has `formatDateTimeInTimeZone` in `src/lib/datetime.ts`. These local implementations use `Intl.DateTimeFormat` directly rather than the centralized utility, creating inconsistency.
**Fix:** Extract to a shared utility or use the existing `formatDateTimeInTimeZone`.

## Verified Safe / No Regression

- Clipboard consolidation (cycle 1 fix) is working correctly — all sites use `copyToClipboard` from `@/lib/clipboard`
- Contest layout hard-navigation fix (cycle 1) is correctly scoped to `data-full-navigate` links only
- `use-source-draft.ts` `removeItem` calls are all wrapped in try/catch (cycle 1 fix verified)
- `compiler-client.tsx` localStorage write is wrapped in try/catch (cycle 1 fix verified)
- `submission-detail-client.tsx` localStorage write is wrapped in try/catch (cycle 1 fix verified)
- No `as any`, `@ts-ignore`, or `@ts-expect-error` in production code
- Only 2 eslint-disable directives in production code (both justified)
- `dangerouslySetInnerHTML` uses are protected with DOMPurify
