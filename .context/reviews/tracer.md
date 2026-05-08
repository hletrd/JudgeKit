# Tracer Review — Cycle 12/100

**Reviewer:** tracer (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** e584aeac
**Scope:** Causal tracing of suspicious flows identified by other reviewers

---

## NEW FINDINGS

### TRC-1: [MEDIUM] Judge deregister route — malformed JSON request trace to 500 response

**File:** `src/app/api/v1/judge/deregister/route.ts:24`

**Causal trace:**
1. Worker POSTs to `/api/v1/judge/deregister` with a truncated or malformed JSON body
2. Route handler enters the outer `try` block at line 19
3. Line 24 executes: `const parsed = deregisterSchema.safeParse(await request.json())`
4. `request.json()` internally buffers the body and calls `JSON.parse()` on the raw bytes
5. `JSON.parse()` throws `SyntaxError: Unexpected end of JSON input` (or similar)
6. The `SyntaxError` propagates out of `safeParse()` because it is thrown BEFORE `safeParse` is called
7. The error is caught by the outer `catch (error)` at line 102
8. The catch block logs the error and returns `apiError("internalServerError", 500)` at line 104
9. Worker receives HTTP 500 and cannot distinguish "bad JSON" from "server failure"
10. Worker retries with the same malformed payload, creating a retry loop

**Root cause:** In cycle 10, four judge routes (register, claim, heartbeat, poll) were fixed by extracting `request.json()` into its own `try/catch` that returns 400 `invalidJson`. The deregister route was omitted from that remediation.

**Fix:** Apply the same pattern: wrap `request.json()` in a dedicated try/catch before passing to `safeParse`.

---

### TRC-2: [LOW] CountdownTimer — deadline extension trace to stale "00:00:00" display

**File:** `src/components/exam/countdown-timer.tsx`

**Causal trace:**
1. Exam starts with `deadline = Date.now() + 3600000` (1 hour from now)
2. Component mounts; `useState` initializer at line 46 computes `deadline - Date.now() <= 0` → false
3. `expired` state is false; `firedThresholds` ref is pre-populated with thresholds relative to 1 hour remaining
4. Main effect starts ticking at line 95; countdown displays normally
5. Time passes; remaining time drops below 0
6. Line 144 sets `expired = true`; display switches to "00:00:00" in destructive variant
7. `handleExpired` callback fires once (guarded by `expiredRef`)
8. Exam administrator extends deadline: parent re-renders with new `deadline` prop (e.g., +30 minutes)
9. React re-runs the main effect because `deadline` is in the dependency array
10. Cleanup function sets `cancelled = true` and clears `timerId`
11. New effect starts with `cancelled = false`
12. Tick handler computes new `remaining = deadline - Date.now()` which is now positive (e.g., 29 minutes)
13. Line 192 evaluates `{expired ? "00:00:00" : formatDuration(remaining)}`
14. `expired` is still `true` (state never reset), so display shows "00:00:00"
15. Student sees red "00:00:00" even though the exam is still active

**Root cause:** `expired` state and `firedThresholds` ref are initialized once on mount and never react to `deadline` prop changes. The effect cleanup only clears the tick timer; it does not reset component state derived from the previous deadline.

**Fix:** Add a `useEffect` that resets `expired` to `deadline - Date.now() <= 0` and re-initializes `firedThresholds` whenever `deadline` changes.

---

### TRC-3: [LOW] CountdownTimer — staggered toast timer leak trace

**File:** `src/components/exam/countdown-timer.tsx:108-133`

**Causal trace:**
1. `staggerToasts = true` and multiple thresholds fire simultaneously (e.g., after tab regains focus after long backgrounding)
2. Main tick loop at line 108 detects thresholds whose remaining time crossed below their trigger point
3. For each fired threshold, line 119 computes `delayMs` based on `staggerIndex`
4. Line 126 calls `setTimeout(() => { ... }, delayMs)` to delay the toast emission
5. The return value of `setTimeout` (the timer ID) is not stored anywhere
6. Effect cleanup at line 178 only clears `timerId` (the main 1s tick timer) and sets `cancelled = true`
7. Staggered timers remain in the browser's timer queue
8. When a staggered timer fires (e.g., 1-4 seconds later), it checks `if (cancelled) return;`
9. Since `cancelled` is true, the callback body does nothing — but the timer itself has fired
10. If component mounts/unmounts repeatedly (tests, fast navigation), orphaned timers accumulate

**Root cause:** Staggered `setTimeout` calls are created but their IDs are not collected for cleanup.

**Fix:** Store staggered timer IDs in an array ref (`staggeredTimerIds`) and clear them all in the cleanup function.

---

## Traces attempted but ruled out

- **apiFetchJson masking (C10-CR-2):** Verified fixed in cycle 11. `res.ok` check now precedes the JSON parse, and non-JSON success responses are treated as errors.
- **Contest join shake timer (C10-CR-3):** Verified fixed in cycle 11. Timer ID is stored in `useRef` and cleared in cleanup.
