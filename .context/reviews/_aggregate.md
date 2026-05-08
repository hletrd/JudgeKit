# Aggregate Review — Cycle 12/100

**Date:** 2026-05-08
**HEAD:** e584aeac
**Reviewers:** code-reviewer, security-reviewer, debugger, perf-reviewer, test-engineer, critic, architect, tracer, verifier, designer, document-specialist (all orchestrator direct; no registered Agent tools)
**Scope:** Full TypeScript/TSX source review focusing on cycle 10 remediation completeness, timer/cleanup correctness, and reactive component behavior
**Approach:** Static code analysis, pattern-based search, targeted deep dives, causal tracing

---

## NEW FINDINGS THIS CYCLE

| ID | Severity | Confidence | Title | Source |
|---|---|---|---|---|
| C12-AGG-1 | MEDIUM | HIGH | Judge deregister route returns 500 on malformed JSON (cycle 10 fix incomplete) | code-reviewer, security-reviewer, debugger, test-engineer, critic, architect, tracer, verifier, document-specialist |
| C12-AGG-2 | LOW | MEDIUM | CountdownTimer does not reset expired state when deadline prop changes | code-reviewer, debugger, designer, critic, architect, tracer, verifier |
| C12-AGG-3 | LOW | MEDIUM | CountdownTimer staggered setTimeout IDs not tracked for cleanup | code-reviewer, debugger, perf-reviewer, critic, tracer, verifier |

---

## CROSS-AGENT AGREEMENT

- **C12-AGG-1** — 9 reviewers agree: the deregister route was omitted from the cycle 10 JSON-parse fix. code-reviewer identified the pattern gap; security-reviewer noted the probing/exposure angle; debugger traced the retry-loop failure mode; test-engineer noted the missing test coverage; critic flagged the incomplete remediation; architect recommended a DRY helper; tracer provided the full causal trace; verifier confirmed by reading the source; document-specialist noted the comment/doc mismatch claiming completeness.
- **C12-AGG-2** — 7 reviewers agree: CountdownTimer does not react to `deadline` prop changes. code-reviewer identified the state initialization gap; debugger traced the stuck-display failure mode; designer flagged the UX panic risk; critic noted the incomplete reactive behavior; architect recommended deriving expired from remaining; tracer provided the full causal trace; verifier confirmed by reading the effect dependencies.
- **C12-AGG-3** — 6 reviewers agree: staggered toast timers leak. code-reviewer identified the untracked setTimeout; debugger traced the accumulation on unmount; perf-reviewer noted the timer queue pollution; critic flagged the missing cleanup; tracer provided the full causal trace; verifier confirmed by reading line 126.

---

## DETAILED FINDINGS

### C12-AGG-1 — Judge deregister route returns 500 on malformed JSON (cycle 10 fix incomplete)

- **Files:**
  - `src/app/api/v1/judge/deregister/route.ts:24`
- **Problem:** Cycle 10 fixed JSON parse error handling across four judge routes (register, claim, heartbeat, poll) by wrapping `await request.json()` in a dedicated try/catch that returns HTTP 400 `invalidJson`. The deregister route was omitted. It still calls `deregisterSchema.safeParse(await request.json())` directly. If the client sends malformed JSON, `request.json()` throws a `SyntaxError` that is caught by the outer try/catch and returned as HTTP 500 `internalServerError`.
- **Concrete failure:** A worker with a JSON serialization bug sends a truncated POST body. The app server logs an error and returns 500. The worker cannot distinguish "bad JSON" from "server down" and may retry with the same bad body, creating error-log noise and potential alert fatigue.
- **Architectural note:** The five judge routes all perform the same manual JSON parse + safeParse + error-return pattern. This DRY violation creates maintenance risk. Future changes to JSON parse error handling must be applied in five places.
- **Fix:** Wrap `await request.json()` in a dedicated try/catch before passing to `safeParse`, returning 400 on JSON parse failure. Consider extracting a shared `parseJudgeBody(schema, request)` helper.
- **Test gap:** No test covers malformed JSON for the deregister route. Cycle 10 added tests for the other four routes.

### C12-AGG-2 — CountdownTimer does not reset expired state when deadline prop changes

- **Files:**
  - `src/components/exam/countdown-timer.tsx:46-48` (expired state initialization)
  - `src/components/exam/countdown-timer.tsx:49` (firedThresholds ref initialization)
  - `src/components/exam/countdown-timer.tsx:192` (display rendering)
- **Problem:** The `expired` state and `firedThresholds` ref are initialized once on mount and never reset when the `deadline` prop changes. If an exam administrator extends the deadline while a student is viewing the countdown, the component remains stuck in the expired state showing "00:00:00" in the destructive/red variant. The `handleExpired` callback also guards against re-firing via `expiredRef`, so even if the new deadline passes again, `onExpired` won't fire.
- **Concrete failure:** Admin extends exam deadline. Student's countdown shows "00:00:00" instead of the new remaining time. Student may panic, submit prematurely, or navigate away thinking the exam has ended.
- **Architectural note:** The component mixes imperative refs (`expiredRef`, `firedThresholds`, `offsetRef`) with React state (`expired`, `remaining`). When `deadline` changes, the imperative state is not reset. Deriving `expired` directly from `remaining <= 0` instead of maintaining it as separate state would eliminate this class of bug.
- **Fix:** Add a `useEffect` that resets `expired` state to `deadline - Date.now() <= 0` and re-initializes `firedThresholds` whenever `deadline` changes.

### C12-AGG-3 — CountdownTimer staggered setTimeout IDs not tracked for cleanup

- **Files:**
  - `src/components/exam/countdown-timer.tsx:126` (staggered setTimeout call)
  - `src/components/exam/countdown-timer.tsx:178-182` (cleanup function)
- **Problem:** When `staggerToasts = true` and multiple thresholds fire simultaneously (e.g., after tab regains focus after long backgrounding), the `setTimeout` calls for delayed toast emissions are not stored in a ref or array. The cleanup function only clears `timerId` (the main 1s tick timer) and sets `cancelled = true`. The staggered timers remain in the browser's timer queue until they fire and self-cancel via the `cancelled` flag.
- **Concrete failure:** User backgrounds the exam tab for several minutes. When they return, multiple thresholds fire. Staggered setTimeout calls are scheduled but the component might unmount (e.g., exam finishes) before they fire. The timers remain in the queue and fire later, checking `cancelled` and doing nothing — a minor resource leak.
- **Fix:** Store staggered setTimeout IDs in a ref array and clear them all in the cleanup function.

---

## AGENT FAILURES

No agent failures. All review work performed directly by the orchestrator due to absence of registered Agent tools.

---

## NEW_FINDINGS COUNT: 3 (1 MEDIUM, 2 LOW)
