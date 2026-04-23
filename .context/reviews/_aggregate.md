# RPF Cycle 30 — Aggregate Review

**Date:** 2026-04-23
**Base commit:** 31afd19b
**Review artifacts:** code-reviewer.md, perf-reviewer.md, security-reviewer.md, architect.md, critic.md, verifier.md, debugger.md, test-engineer.md, tracer.md, designer.md, document-specialist.md

## Previously Fixed Items (Verified in Current Code)

All prior cycle aggregate findings have been addressed:
- AGG-1 (clarification i18n): Fixed in commit 7e0b3bb8
- AGG-2 (provider error sanitization): Fixed in commit 93beb49d
- AGG-3 (useVisibilityPolling setTimeout): Fixed in commit 60f24288
- AGG-4 (progress bar aria-label): Fixed in commit 3530a989
- All other prior findings verified as fixed

## Deduped Findings (sorted by severity then signal)

### AGG-1: Exam countdown timer uses `setInterval` — last remaining client-side timer with old pattern [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-1), perf-reviewer (PERF-1), architect (ARCH-1), critic (CRI-1), verifier (V-1), debugger (DBG-1), tracer (TR-1), designer (DES-1), test-engineer (TE-1)
**Signal strength:** 9 of 11 review perspectives

**File:** `src/components/exam/countdown-timer.tsx:117`

**Description:** The exam countdown timer uses `setInterval(recalculate, 1000)` on line 117. The codebase has established recursive `setTimeout` as the standard pattern for all timer-based effects. The `useVisibilityPolling` hook was migrated in cycle 29, and the contest-replay component in cycle 28. The countdown timer is now the only remaining client-side timer using `setInterval`.

This is particularly significant because the countdown timer is the most important timer in the application — students rely on accurate time remaining during proctored exams. While the `visibilitychange` handler (line 122) mitigates most drift, `setInterval` can still cause catch-up behavior during the brief window between interval firing and visibility change handler running.

**Concrete failure scenario:** A student switches to another tab during an exam. When they return, throttled `setInterval` callbacks may fire in rapid succession before the `visibilitychange` handler runs, causing a momentary flash of incorrect time remaining.

**Fix:** Migrate to recursive `setTimeout` pattern:
```typescript
let timerId: ReturnType<typeof setTimeout> | null = null;
let cancelled = false;

function scheduleNext() {
  timerId = setTimeout(() => {
    if (cancelled) return;
    recalculate();
    scheduleNext();
  }, 1000);
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    recalculate();
  }
}

scheduleNext();
document.addEventListener("visibilitychange", handleVisibilityChange);

return () => {
  cancelled = true;
  if (timerId) clearTimeout(timerId);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
};
```

---

### AGG-2: `rate-limiter-client.ts` has unguarded `.json()` on success path — circuit breaker trips on parse errors [LOW/MEDIUM]

**Flagged by:** security-reviewer (SEC-1), verifier (V-2), debugger (DBG-2), tracer (TR-2)
**Signal strength:** 4 of 11 review perspectives

**File:** `src/lib/security/rate-limiter-client.ts:79`

**Description:** The `callRateLimiter` function calls `response.json()` without a `.catch()` guard on line 79. If the rate-limiter sidecar returns a non-JSON body (e.g., an HTML error page from a misconfigured reverse proxy returning a 200 status), the `SyntaxError` is caught by the outer try/catch which increments `consecutiveFailures` and opens the circuit breaker. This treats a parse error the same as a network failure, which is incorrect behavior.

This is the same class of issue tracked as DEFER-38 (unguarded `.json()` on success paths). While this is server-side code calling an internal sidecar (lower risk than client-side), it produces incorrect circuit-breaker behavior.

**Concrete failure scenario:** The rate-limiter sidecar is behind nginx. nginx temporarily returns a 200 HTML page instead of proxying correctly. The `response.json()` throws `SyntaxError`. The circuit breaker opens for 30 seconds, causing all rate-limit checks to fall through to the DB-backed limiter.

**Fix:** Add `.catch()` to the `.json()` call and handle parse errors separately:
```typescript
const data = (await response.json().catch(() => null)) as T | null;
if (data === null) {
  consecutiveFailures++;
  circuitOpenUntil = Date.now() + RECOVERY_WINDOW_MS;
  return null;
}
```

---

### AGG-3: Chat widget `sendMessage` has unstable `messages` dependency causing unnecessary re-renders [LOW/LOW]

**Flagged by:** code-reviewer (CR-2), architect (ARCH-2), critic (CRI-2)
**Signal strength:** 3 of 11 review perspectives

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:215`

**Description:** The `sendMessage` useCallback includes `messages` in its dependency array (line 215). Since `messages` is a state array that changes on every sent/received message, the callback is recreated on every message change. This causes downstream `handleSend` and `handleKeyDown` callbacks to also be recreated, triggering unnecessary re-renders.

**Fix:** Use a ref for messages within the callback to stabilize the dependency array:
```typescript
const messagesRef = useRef(messages);
useEffect(() => { messagesRef.current = messages; }, [messages]);
// Then use messagesRef.current in sendMessage instead of messages
```

---

### AGG-4: `active-timed-assignment-sidebar-panel.tsx` uses `setInterval` for countdown [LOW/LOW]

**Flagged by:** perf-reviewer (PERF-2)
**Signal strength:** 1 of 11 review perspectives

**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:63`

**Description:** This component uses `window.setInterval` for its countdown. This was noted in cycle 29 (PERF-2) and is lower severity because:
1. It has a `visibilitychange` handler that corrects drift on tab switch
2. The sidebar timer is informational, not safety-critical like exam countdown
3. The interval self-terminates when all assignments expire

**Fix:** Could be migrated to recursive `setTimeout` for consistency, but low priority.

---

## Performance Findings (carried/deferred)

### PERF-CARRIED-1: sidebar interval re-entry — LOW/LOW, deferred from cycle 26
### PERF-CARRIED-2: Unbounded analytics query — carried from DEFER-31
### PERF-CARRIED-3: Scoring full-table scan — carried from DEFER-31

## Security Findings (carried)

### SEC-CARRIED-1: `window.location.origin` for URL construction — covered by DEFER-24
### SEC-CARRIED-2: Encryption plaintext fallback — MEDIUM/MEDIUM, carried from DEFER-39
### SEC-CARRIED-3: `AUTH_CACHE_TTL_MS` has no upper bound — LOW/MEDIUM, carried from DEFER-40
### SEC-CARRIED-4: Anti-cheat localStorage persistence — LOW/LOW, carried from DEFER-48
### SEC-CARRIED-5: `sanitizeHtml` root-relative img src — LOW/LOW, carried from DEFER-49

## Previously Deferred Items (Carried Forward)

All previously deferred items from prior cycle plans remain in effect:
- DEFER-1 through DEFER-13 (from cycle 23)
- DEFER-14 (centralized error handling / useApiFetch hook, from cycle 24)
- DEFER-15 (window.confirm replacement, from cycle 25)
- DEFER-16 (ContestAnnouncements polling, from cycle 25)
- DEFER-17 (Inconsistent createApiHandler, from cycle 27)
- DEFER-18 (Contest layout forced navigation, from cycle 27)
- DEFER-19 (use-source-draft JSON.parse validation, from cycle 27)
- DEFER-20 (Contest clarifications show userId — requires backend change)
- DEFER-21 (Duplicated visibility-aware polling pattern)
- DEFER-29 through DEFER-41 (from April-22 cycle 28 plan)

## Agent Failures

None. All 11 review perspectives completed successfully.
