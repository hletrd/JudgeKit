# Performance Review — RPF Cycle 8

**Date:** 2026-04-22
**Reviewer:** perf-reviewer
**Base commit:** 55ce822b

## Findings

### PERF-1: `participant-anti-cheat-timeline.tsx` `fetchEvents` replaces entire event list on every poll — loses loaded pages [MEDIUM/MEDIUM]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:90-108, 129`

**Description:** The `fetchEvents` callback (triggered by `useVisibilityPolling` every 30 seconds) always fetches from offset 0 and replaces the `events` state with only the first page of results. If the user has loaded additional pages via `loadMore`, those pages are lost on the next polling refresh. This causes unnecessary re-fetching and poor UX — the user sees their expanded list "jump back" to the first page every 30 seconds.

**Fix:** When events are already loaded beyond the first page, use a diff/merge strategy or skip the refresh if the first page matches.

**Confidence:** HIGH

---

### PERF-2: `submission-overview.tsx` continues polling even when dialog is closed [LOW/LOW]

**File:** `src/components/lecture/submission-overview.tsx:123`

**Description:** `useVisibilityPolling` runs continuously with a 5-second interval, even when the dialog is closed. The `fetchStats` callback has a ref-based guard (`openRef.current`) that prevents the actual API call, but the `setTimeout` scheduling still happens every 5 seconds. This is wasteful but low impact since the actual network call is skipped.

**Fix:** Conditionally enable/disable the polling based on the `open` prop.

**Confidence:** LOW

---

### PERF-3: `database-backup-restore.tsx` restore success path makes unnecessary `response.json()` call [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:150`

**Description:** After a successful database restore, the code calls `await response.json()` on line 150 and discards the result. For a large restore response, this unnecessarily parses JSON that is never used. The restore endpoint returns a simple status — the body is not needed.

**Fix:** Remove the `await response.json()` call or replace with `await response.text().catch(() => "")` to drain the body without parsing.

**Confidence:** LOW

---

## Final Sweep

The `useVisibilityPolling` hook is used consistently across contest monitoring components. The `useSubmissionPolling` hook properly implements SSE-to-fetch-polling fallback with exponential backoff. The code snapshot timer in `problem-submission-form.tsx` adapts its interval based on user activity. The execution limiter in `execute.ts` caps concurrent Docker containers. The rate-limiter client properly fails open with circuit breaker. The main performance concern is the anti-cheat timeline resetting on polling refresh.
