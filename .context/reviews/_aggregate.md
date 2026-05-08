# Aggregate Review — Cycle 10/100 (Current)

**Date:** 2026-05-08
**HEAD:** 2a6db3dd
**Reviewers:** code-reviewer, security-reviewer, debugger (orchestrator direct; no registered Agent tools)
**Scope:** Full TypeScript/TSX source review focusing on API correctness, error handling, and client-side cleanup
**Approach:** Static code analysis, pattern-based search, targeted deep dives

---

## NEW FINDINGS THIS CYCLE

| ID | Severity | Confidence | Title | Source |
|---|---|---|---|---|
| C10-CR-1 | MEDIUM | HIGH | Judge routes return 500 on malformed JSON request body | code-reviewer, security-reviewer, debugger |
| C10-CR-2 | MEDIUM | MEDIUM | apiFetchJson masks non-JSON success responses as valid data | code-reviewer, security-reviewer, debugger |
| C10-CR-3 | LOW | MEDIUM | contest-join-client setTimeout not cleaned up on unmount | code-reviewer, debugger |

---

## CROSS-AGENT AGREEMENT

- **C10-CR-1** — All 3 reviewers agree: judge routes mishandle malformed JSON. code-reviewer identifies the structural pattern across 4 files; security-reviewer notes the error-handling gap and inability for workers to distinguish bad input from server failure; debugger provides the failure-mode analysis.
- **C10-CR-2** — 3 reviewers agree: `apiFetchJson`'s unconditional `.catch(() => fallback)` on `res.json()` is risky for success-path parsing. code-reviewer identifies the data-masking issue; security-reviewer notes potential for MITM/compromised-proxy masking; debugger describes the concrete failure scenario.
- **C10-CR-3** — code-reviewer and debugger agree on the unguarded timer in contest-join-client.

---

## DETAILED FINDINGS

### C10-CR-1 — Judge routes return 500 on malformed JSON request body

- **Files:**
  - `src/app/api/v1/judge/register/route.ts:34`
  - `src/app/api/v1/judge/claim/route.ts:65`
  - `src/app/api/v1/judge/heartbeat/route.ts:30`
  - `src/app/api/v1/judge/poll/route.ts:32`
- **Problem:** Each judge route parses the request body with `await request.json()` directly inside a `.safeParse()` call. If the client sends malformed JSON (truncated body, invalid syntax, proxy corruption), `request.json()` throws a `SyntaxError`. This bypasses schema validation and is caught by the outer `try/catch`, returning HTTP 500 `internalServerError` instead of HTTP 400 `invalidJson`.
- **Concrete failure:** A worker with a JSON serialization bug sends a truncated POST body. The app server logs an error and returns 500. The worker retries with the same bad body, causing error-log noise and potential alert fatigue. The worker operator cannot tell whether the server is broken or their request is malformed.
- **Fix:** Wrap `await request.json()` in a `try/catch` before passing to `safeParse`, returning 400 on JSON parse failure.

### C10-CR-2 — apiFetchJson masks non-JSON success responses as valid data

- **File:** `src/lib/api/client.ts:126-127`
- **Problem:** `apiFetchJson` unconditionally calls `res.json()` and uses `.catch(() => fallback)`. When the server returns HTTP 200 with a non-JSON body (empty body, HTML from reverse proxy, chunked transfer ending mid-JSON), the parse fails, `fallback` is returned, and because `res.ok` is true, the caller receives `{ok: true, data: fallback}`. The caller proceeds with default/empty data believing it is real server data.
- **Concrete failure:** A misconfigured nginx returns HTML with status 200 for a proxied API endpoint. A client component using `apiFetchJson` receives `{ok: true, data: fallback}` and renders stale/default data without any error indication.
- **Fix:** In `apiFetchJson`, if `res.ok` is true but `res.json()` throws, treat it as a network/parsing error rather than success.

### C10-CR-3 — contest-join-client setTimeout not cleaned up on unmount

- **File:** `src/app/(public)/contests/join/contest-join-client.tsx:68`
- **Problem:** In the catch block of `handleJoin`, `setTimeout(() => setShaking(false), 600)` is not stored in a ref and not cleared in a cleanup effect. If the component unmounts before the timeout fires, React may log a warning.
- **Concrete failure:** User submits invalid code, gets error shake, immediately navigates away. 600ms later, timeout fires and attempts `setShaking(false)` on unmounted component.
- **Fix:** Store the timeout ID in a `useRef` and clear it in a `useEffect` cleanup.

---

## AGENT FAILURES

No agent failures. All review work performed directly by the orchestrator due to absence of registered Agent tools.

---

## NEW_FINDINGS COUNT: 3 (2 MEDIUM, 1 LOW)
