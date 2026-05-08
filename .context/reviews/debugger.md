# Debugger Review — Cycle 10/100

**Reviewer:** debugger (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** 2a6db3dd
**Scope:** Latent bug surface, failure modes, race conditions, regressions

---

## NEW FINDINGS

### C10-DB-1 — Judge routes return 500 on malformed JSON body
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Files:**
  - `src/app/api/v1/judge/register/route.ts:34`
  - `src/app/v1/judge/claim/route.ts:65`
  - `src/app/v1/judge/heartbeat/route.ts:30`
  - `src/app/v1/judge/poll/route.ts:32`
- **Problem:** `await request.json()` throws `SyntaxError` on malformed JSON. The outer `try/catch` returns HTTP 500 instead of 400. This is a failure-mode mismatch: the client sent bad data but the server reports an internal error.
- **Failure scenario:** A worker with a bug sends a truncated POST body. The app server logs an error and returns 500. The worker retries with the same bad body, causing error-log noise and potential alert fatigue.
- **Fix:** Guard JSON parsing with an explicit try/catch that returns 400.

### C10-DB-2 — apiFetchJson success-path parse failure masks server issues
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **File:** `src/lib/api/client.ts:126-127`
- **Problem:** When `res.ok` is true but the body is not valid JSON, `apiFetchJson` returns `{ok: true, data: fallback}`. This hides the fact that the server returned a malformed response.
- **Failure scenario:** A proxy misconfiguration returns HTML with status 200. The client receives fallback data and proceeds as if the request succeeded, potentially causing data loss or incorrect UI state.
- **Fix:** Separate the error-handling paths: if `res.ok` is true, JSON parse failure should be treated as a fetch error (return `{ok: false, data: fallback}` or throw).

### C10-DB-3 — contest-join-client shake timer not guarded on unmount
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/(public)/contests/join/contest-join-client.tsx:68`
- **Problem:** `setTimeout(() => setShaking(false), 600)` in catch block fires after component unmount if navigation happens quickly after failed join.
- **Failure scenario:** User submits invalid code, gets error shake, immediately navigates away. 600ms later, timeout fires and attempts `setShaking(false)` on unmounted component.
- **Fix:** Store timeout in `useRef` and clear in `useEffect` cleanup.

---

## CARRY-FORWARD DEFERRED ITEMS

All previously deferred items remain unchanged. Not re-reported per cycle instructions.
