# RPF Cycle 4 — Debugger

**Date:** 2026-04-22
**Base commit:** 5d89806d

## Findings

### DBG-1: `invite-participants.tsx` `handleInvite` — `res.json()` on error path can throw SyntaxError [MEDIUM/MEDIUM]

**File:** `src/components/contest/invite-participants.tsx:78`
**Confidence:** HIGH

When the server returns a non-JSON error response (e.g., 502 HTML), `await res.json()` throws a SyntaxError. The outer `catch` handles it generically but the user sees `t("inviteFailed")` instead of a more specific error. This is a latent bug of the same class fixed across many components in cycle 3.

**Concrete failure scenario:** nginx returns 502 Bad Gateway with HTML body when the upstream is restarting. User clicks "Invite" and sees "inviteFailed" toast with no actionable information.

**Fix:** Add `.catch(() => ({}))` after `res.json()` on line 78, then check the error code from the parsed object.

---

### DBG-2: `access-code-manager.tsx` `res.json()` on success path — no `.catch()` for malformed JSON [MEDIUM/MEDIUM]

**File:** `src/components/contest/access-code-manager.tsx:42,88`
**Confidence:** MEDIUM

In `fetchCode` (line 42) and `handleGenerate` (line 88), `res.json()` is called after `res.ok` check but without `.catch()`. If the API returns a 200 with malformed JSON (e.g., truncated response due to connection issues), `res.json()` throws an unhandled SyntaxError within the try/catch block, resulting in a generic error toast.

**Concrete failure scenario:** Server returns 200 but the JSON body is truncated due to a proxy timeout. User sees "Error" toast with no indication of what went wrong.

**Fix:** Add `.catch(() => ({}))` after both `res.json()` calls.

---

### DBG-3: `countdown-timer.tsx` — timer drift when tab is hidden and browser throttles `setInterval` [MEDIUM/MEDIUM]

**File:** `src/components/exam/countdown-timer.tsx:100`
**Confidence:** HIGH

When the page is hidden, browsers commonly throttle `setInterval` to once per second or less. When the tab becomes visible again, the `remaining` state may be stale because the interval was throttled. The component calculates `remaining` from `deadline - (Date.now() + offsetRef.current)`, but the state update only happens when the interval fires.

**Concrete failure scenario:** Student is in an exam, switches to a different tab for 5 minutes, then switches back. The displayed remaining time is 5 minutes behind (showing 25:00 instead of 20:00) until the next interval tick corrects it, which creates a visible "jump" in the countdown.

**Fix:** Add a `visibilitychange` listener that recalculates `remaining` immediately when the tab becomes visible, using `deadline - (Date.now() + offsetRef.current)`.

---

### DBG-4: `anti-cheat-monitor.tsx` — event listener gap during re-registration [LOW/MEDIUM]

**File:** `src/components/exam/anti-cheat-monitor.tsx:162-242`
**Confidence:** MEDIUM

When `reportEvent` or `flushPendingEvents` change (due to `sendEvent` recreation), the `useEffect` cleanup runs and removes all event listeners, then re-adds them. During this gap, anti-cheat events like `tab_switch` or `copy` are not detected.

**Concrete failure scenario:** Student switches tabs during the exact moment the event listeners are being re-registered. The tab-switch event is not captured, and no warning toast is shown.

**Fix:** Use the ref-based callback pattern so event listeners are only registered once.

---

## Verified Safe / No Bug Found

- `SubmissionListAutoRefresh` properly handles errors with fetch-based detection (cycle 3 fix working)
- `normalizeSubmission` properly validates all numeric fields with `Number.isFinite`
- `leaderboard-table.tsx` validates response shape before setting state
- SSE events route properly excludes `sourceCode` from query results
- Anti-cheat event validation on server side uses Zod schema with `z.enum(CLIENT_EVENT_TYPES)`
- `loadPendingEvents` in `anti-cheat-monitor.tsx` properly validates parsed JSON with `isValidPendingEvent` (cycle 3 fix confirmed)
