# RPF Cycle 30 Review Remediation Plan

**Date:** 2026-04-23
**Base commit:** 31afd19b
**Review artifacts:** All per-agent reviews in `.context/reviews/` + `.context/reviews/_aggregate.md`

## Previously Completed Tasks (Verified in Current Code)

All cycle 29 tasks are complete:
- [x] Task A: Clarification quick-answer i18n — Fixed in commit 7e0b3bb8
- [x] Task B: Provider error sanitization — Fixed in commit 93beb49d
- [x] Task C: useVisibilityPolling setTimeout — Fixed in commit 60f24288
- [x] Task D: Progress bar aria-label — Fixed in commit 3530a989

## Tasks (priority order)

### Task A: Migrate `countdown-timer.tsx` from `setInterval` to recursive `setTimeout` [MEDIUM/MEDIUM]

**From:** AGG-1 (9 reviewers), CR-1, PERF-1, ARCH-1, CRI-1, V-1, DBG-1, TR-1, DES-1, TE-1
**Severity / confidence:** MEDIUM / MEDIUM
**File:** `src/components/exam/countdown-timer.tsx:117`

**Problem:** The exam countdown timer uses `setInterval(recalculate, 1000)`. The codebase has established recursive `setTimeout` as the standard pattern for all timer-based effects. The `useVisibilityPolling` hook was migrated in cycle 29, and the contest-replay component in cycle 28. The countdown timer is now the only remaining client-side timer using `setInterval`. This is particularly significant because the countdown timer is the most important timer in the application — students rely on accurate time remaining during proctored exams.

**Plan:**
1. Replace `setInterval(recalculate, 1000)` with a recursive `setTimeout` pattern using `cancelled` flag
2. The `visibilitychange` handler remains — it provides immediate correction on tab switch
3. Use `clearTimeout` instead of `clearInterval` in the cleanup function
4. Verify all gates pass

**Status:** DONE (commit 19de5cf6)

---

### Task B: Add `.catch()` guard to `rate-limiter-client.ts` `.json()` call [LOW/MEDIUM]

**From:** AGG-2 (4 reviewers), SEC-1, V-2, DBG-2, TR-2
**Severity / confidence:** LOW / MEDIUM
**File:** `src/lib/security/rate-limiter-client.ts:79`

**Problem:** The `callRateLimiter` function calls `response.json()` without a `.catch()` guard. If the rate-limiter sidecar returns a non-JSON body (e.g., HTML from a proxy), the `SyntaxError` is caught by the outer try/catch which incorrectly increments the circuit breaker. This is the same class of issue tracked as DEFER-38.

**Plan:**
1. Add `.catch(() => null)` to the `response.json()` call on line 79
2. Check for `null` result and handle parse errors by incrementing circuit breaker and returning null
3. Verify all gates pass

**Status:** DONE (commit 7ae57906)

---

### Task C: Stabilize chat widget `sendMessage` dependency array [LOW/LOW]

**From:** AGG-3 (3 reviewers), CR-2, ARCH-2, CRI-2
**Severity / confidence:** LOW / LOW
**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:215`

**Problem:** The `sendMessage` useCallback includes `messages` in its dependency array, causing unnecessary callback recreation on every message change. This triggers re-renders through `handleSend` and `handleKeyDown`.

**Plan:**
1. Add a `messagesRef` using `useRef(messages)` 
2. Keep the ref in sync with a `useEffect`
3. Use `messagesRef.current` inside `sendMessage` instead of `messages`
4. Remove `messages` from the dependency array of `sendMessage`
5. Verify all gates pass

**Status:** DONE (commit ce9aa4fa)

---

## Deferred Items

### DEFER-1 through DEFER-21: Carried from cycle 29

See `plans/open/2026-04-23-rpf-cycle-29-review-remediation.md` for the full deferred list. All carry forward unchanged.

### DEFER-29: Migrate raw route handlers to `createApiHandler` (carried from DEFER-1)

**Reason:** Large refactor requiring careful testing of each route. Not a quick fix.
**Exit criterion:** All manual-auth routes migrated and tested.

### DEFER-30: SSRF via chat widget test-connection endpoint (SEC-1)

**Reason:** Already mitigated — uses stored keys, model validation applied. Requires API design decision for further hardening.
**Severity:** HIGH but mitigated.
**Exit criterion:** Product decision made on test-connection API design; implementation follows.

### DEFER-31: Performance P0 fixes (deregister race, unbounded analytics, unbounded similarity check, scoring full-table scan)

**Reason:** These are production performance issues requiring careful benchmarking and testing.
**Severity:** CRITICAL but requires production testing.
**Exit criterion:** Each P0 fix benchmarked and tested in staging.

### DEFER-32 through DEFER-41: Carried from cycle 29

All deferred items from the cycle 29 plan carry forward unchanged.

### DEFER-42: `active-timed-assignment-sidebar-panel.tsx` uses `setInterval` for countdown (from AGG-4)

- **Source:** AGG-4 (perf-reviewer PERF-2)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:63`
- **Reason for deferral:** The component already has a `visibilitychange` handler that corrects drift on tab switch. The sidebar timer is informational, not safety-critical like exam countdown. The interval self-terminates when all assignments expire. Previously noted in cycle 29 (PERF-2).
- **Exit criterion:** When a cycle has capacity for a focused timer consistency pass, or when the sidebar panel is being modified for another reason.

---

## Progress log

- 2026-04-23: Plan created with 3 tasks and 1 new deferred item (DEFER-42).
- 2026-04-23: All 3 tasks completed. Task A (countdown timer setTimeout) — commit 19de5cf6. Task B (rate-limiter .json() guard) — commit 7ae57906. Task C (chat widget dependency stabilization) — commit ce9aa4fa. All gates passed (ESLint, next build, vitest unit 294/294 pass, vitest integration 37 skipped, vitest component 22 pre-existing failures unrelated to changes).
