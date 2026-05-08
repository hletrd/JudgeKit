# Code Review — Cycle 10/100

**Reviewer:** code-reviewer (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** 2a6db3dd
**Scope:** Full TypeScript/TSX source review, API routes, client components

---

## NEW FINDINGS

### C10-CR-1 — Judge routes return 500 on malformed JSON request body
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Files:**
  - `src/app/api/v1/judge/register/route.ts:34`
  - `src/app/api/v1/judge/claim/route.ts:65`
  - `src/app/api/v1/judge/heartbeat/route.ts:30`
  - `src/app/api/v1/judge/poll/route.ts:32`
- **Problem:** Each judge route parses the request body with `await request.json()` directly inside a `.safeParse()` call. If the client sends malformed JSON (e.g., truncated body, invalid syntax, network proxy corruption), `request.json()` throws a `SyntaxError`. This bypasses schema validation and is caught by the outer `try/catch`, returning HTTP 500 `internalServerError` instead of HTTP 400 `invalidJson`.
- **Failure scenario:** A misconfigured worker or a proxy that corrupts the JSON body causes the app server to log 500 errors and return an opaque error to the worker, making debugging harder and potentially triggering false-positive alerting.
- **Fix:** Wrap `await request.json()` in a `try/catch` before passing to `safeParse`, returning 400 on JSON parse failure. Alternatively, extract body parsing into a shared helper used by all judge routes.

### C10-CR-2 — apiFetchJson masks non-JSON success responses as valid data
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **File:** `src/lib/api/client.ts:126-127`
- **Problem:** `apiFetchJson` unconditionally calls `res.json()` and uses `.catch(() => fallback)`. When the server returns HTTP 200 with a non-JSON body (empty body, HTML from a reverse proxy, or chunked transfer that ends mid-JSON), the parse fails, `fallback` is returned, and because `res.ok` is true, the caller receives `{ok: true, data: fallback}`. The caller proceeds with default/empty data believing it is real server data.
- **Failure scenario:** A misconfigured nginx or load balancer returns HTML for a 200-range response. The client component receives empty/default data and may render incorrect UI or silently fail.
- **Fix:** In `apiFetchJson`, if `res.ok` is true but `res.json()` throws, treat it as a network/parsing error rather than success. Only apply the fallback-on-error behavior when `res.ok` is false.

### C10-CR-3 — contest-join-client setTimeout not cleaned up on unmount
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/(public)/contests/join/contest-join-client.tsx:68`
- **Problem:** In the catch block of `handleJoin`, `setTimeout(() => setShaking(false), 600)` is not stored in a ref and not cleared in a cleanup effect. If the component unmounts before the timeout fires, React may log a warning about setting state on an unmounted component.
- **Fix:** Store the timeout ID in a `useRef` and clear it in a `useEffect` cleanup.

---

## Previously Deferred (NOT re-reported)
- Loading skeleton index-based React keys (C9-CR-4) — LOW/LOW, deferred
- LeaderboardTable index-based React keys (C9-CR-5) — LOW/LOW, deferred
- AntiCheatDashboard index-based React keys (C9-CR-6) — LOW/LOW, deferred
- useKeyboardShortcuts unconditionally blocks modifier keys (C8-ME-2) — LOW/LOW, deferred
- SettingsTabs missing hash hydration on mount (C8-LO-2) — LOW/LOW, deferred
- useSubmissionPolling SSE fallback cleanup race (C8-LO-9) — LOW/LOW, deferred
- AnalyticsCharts index-based React keys (C9-CR-10) — LOW/LOW, deferred
- RecruitingInvitationsPanel index-based React keys (C9-CR-8) — LOW/LOW, deferred
- ParticipantAntiCheatTimeline index-based React keys (C9-CR-7) — LOW/LOW, deferred
- BulkCreateDialog index-based React keys (C9-CR-9) — LOW/LOW, deferred
