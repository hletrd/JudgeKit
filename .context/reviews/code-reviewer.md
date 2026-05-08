# Code Review — Cycle 12/100

**Reviewer:** code-reviewer (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** e584aeac
**Scope:** Full TypeScript/TSX source review, API routes, client components

---

## NEW FINDINGS

### C12-CR-1 — Judge deregister route returns 500 on malformed JSON request body
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/judge/deregister/route.ts:24`
- **Problem:** The deregister route parses the request body with `await request.json()` directly inside `.safeParse()`. If the client sends malformed JSON, `request.json()` throws a `SyntaxError`. This bypasses schema validation and is caught by the outer `try/catch`, returning HTTP 500 `internalServerError` instead of HTTP 400 `invalidJson`. This is the exact same pattern that was fixed in cycle 10 for register, claim, heartbeat, and poll routes — deregister was missed.
- **Failure scenario:** A worker with a JSON serialization bug sends a truncated POST body. The app server logs an error and returns 500. The worker retries with the same bad body, causing error-log noise and potential alert fatigue.
- **Fix:** Wrap `await request.json()` in a `try/catch` before passing to `safeParse`, returning 400 on JSON parse failure.

### C12-CR-2 — CountdownTimer staggered setTimeout not tracked for cleanup
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/exam/countdown-timer.tsx:126`
- **Problem:** When `staggerToasts=true` and multiple thresholds fire simultaneously (e.g., after tab regains focus), the `setTimeout` calls for delayed toast emissions are not stored in a ref/array and not explicitly cleared in the cleanup function. While the `cancelled` flag guards the callback body, the timers themselves accumulate in the browser's timer queue. On component unmount or effect re-run, these timers fire unnecessarily.
- **Failure scenario:** User backgrounds the exam tab for several minutes. When they return, multiple thresholds may fire. The staggered setTimeout calls are scheduled but the component might unmount (e.g., exam finishes) before they fire. The timers remain in the queue and fire later, checking `cancelled` and doing nothing — a minor resource leak.
- **Fix:** Store staggered setTimeout IDs in a ref array and clear them all in the cleanup function.

### C12-CR-3 — CountdownTimer does not reset expired state when deadline prop changes
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/exam/countdown-timer.tsx:46-48`
- **Problem:** The `expired` state and `firedThresholds` ref are initialized once on mount and never reset when the `deadline` prop changes. If the deadline is extended (e.g., exam time extension), the component remains stuck in the expired state showing "00:00:00" because `expired` is still true and `handleExpired` guards against re-triggering via `expiredRef`.
- **Failure scenario:** An exam administrator extends the deadline while a student is actively viewing the countdown. The countdown continues to show "00:00:00" in red instead of recalculating the new remaining time.
- **Fix:** Add an effect that resets `expired` state and re-initializes `firedThresholds` when `deadline` changes.

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
