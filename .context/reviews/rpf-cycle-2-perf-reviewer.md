# RPF Cycle 2 — Performance Reviewer

**Date:** 2026-04-22
**Base commit:** 14218f45

## Findings

### PERF-1: `SubmissionListAutoRefresh` lacks error-state backoff — compounding load during server stress [MEDIUM/MEDIUM]

**File:** `src/components/submission-list-auto-refresh.tsx:24-28`
**Description:** (Carried forward from AGG-9, upgraded severity.) The auto-refresh component calls `router.refresh()` on a fixed interval (5s active, 10s idle) with no error handling. During server overload, this creates a compounding load problem because every client continues polling at the same rate. The submission detail polling in `use-submission-polling.ts` correctly implements exponential backoff (`delayMs = Math.min(delayMs * 2, 30000)`), but this list component does not.
**Concrete failure scenario:** During a large contest with 200 participants viewing the submission list, the server starts returning errors. All 200 clients continue polling at 5-second intervals, generating 40 req/s of useless traffic that delays recovery.
**Fix:** Add error-state tracking and exponential backoff. On `router.refresh()` failure (detectable via the `useRouter` error state or by wrapping the call), switch to a longer interval and gradually restore.

### PERF-2: Practice page Path B progress filter still fetches all matching IDs + submissions into memory [MEDIUM/MEDIUM] (carried forward)

**File:** `src/app/(public)/practice/page.tsx:410-519`
**Description:** Carried forward from cycle 18 (AGG-3). When a progress filter is active, Path B fetches ALL matching problem IDs and ALL user submissions into memory, filters in JavaScript, and paginates. The code has a comment acknowledging this should be moved to SQL. Not an immediate bug but a scalability concern.
**Fix:** Move the progress filter logic into a SQL CTE or subquery.

### PERF-3: `contest-clarifications.tsx` and `contest-announcements.tsx` both fetch full data on every visibility change — no cache/ETag [LOW/LOW]

**Files:** `src/components/contest/contest-clarifications.tsx:87-111`, `src/components/contest/contest-announcements.tsx:71-95`
**Description:** Both components fetch the full dataset on every `visibilitychange` event (tab focus) and on a 30-second interval. There's no `If-None-Match` / ETag caching or incremental update mechanism. For small datasets this is fine, but for contests with many clarifications, this creates unnecessary network and server load.
**Fix:** Consider adding conditional fetch headers or incremental sync.

## Verified Safe

- SSE connection management uses shared polling — one DB query per tick for all subscribers
- SSE connection limits are enforced (global 500, per-user configurable)
- Submission detail polling has proper exponential backoff
- Draft persistence uses debounced writes (500ms)
- Anti-cheat heartbeat uses 30-second intervals with visibility gating
