# RPF Cycle 4 — Aggregate Review

**Date:** 2026-04-22
**Base commit:** 5d89806d
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, verifier, debugger, critic, architect, test-engineer, designer, tracer, document-specialist

## Deduplicated Findings

### AGG-1: `invite-participants.tsx` — `res.json()` on error path without `.catch()` [MEDIUM/MEDIUM]

**File:** `src/components/contest/invite-participants.tsx:78`
**Confidence:** HIGH
**Agents agreeing:** CR-1, SEC-1, DBG-1, V-1

In `handleInvite`, when `!res.ok`, `await res.json()` is called without `.catch()`. If the server returns a non-JSON error body (e.g., 502 HTML from nginx), a SyntaxError is thrown. The outer `catch` handles it generically but the user sees `t("inviteFailed")` instead of a specific error. Same class of bug fixed in cycle 3 for other components but this file was missed.

**Fix:** Add `.catch(() => ({}))` after `res.json()` on line 78.

---

### AGG-2: `access-code-manager.tsx` — `res.json()` without `.catch()` on both paths [MEDIUM/MEDIUM]

**File:** `src/components/contest/access-code-manager.tsx:42,88`
**Confidence:** HIGH
**Agents agreeing:** CR-2, SEC-1, DBG-2, V-2

Same class of issue as AGG-1. In `fetchCode` (line 42) and `handleGenerate` (line 88), `res.json()` is called without `.catch()`. The pattern is inconsistent with the project convention established in cycle 3.

**Fix:** Add `.catch(() => ({}))` after both `res.json()` calls.

---

### AGG-3: `access-code-manager.tsx` — dynamic `import("@/lib/clipboard")` should be static [LOW/MEDIUM]

**File:** `src/components/contest/access-code-manager.tsx:61`
**Confidence:** MEDIUM
**Agents agreeing:** CR-3, SEC-2, V-4, ARCH-3, TRACE-3

The `copyValue` function uses `await import("@/lib/clipboard")` (dynamic import). This was fixed in `recruiting-invitations-panel.tsx` during cycle 3 by converting to a static import, but the same pattern persists in `access-code-manager.tsx`. In a strict CSP environment, dynamic imports could be blocked. The clipboard utility is small and always client-side; there's no code-splitting benefit.

**Fix:** Replace dynamic import with static `import { copyToClipboard } from "@/lib/clipboard"` at the top of the file.

---

### AGG-4: `countdown-timer.tsx` — timer drift when tab is hidden [MEDIUM/HIGH]

**File:** `src/components/exam/countdown-timer.tsx:100`
**Confidence:** HIGH
**Agents agreeing:** PERF-1, DBG-3, V-3, DES-1, TRACE-2

The `setInterval` on line 100 ticks every second regardless of document visibility. When the page is hidden, browsers throttle `setInterval`, causing the `remaining` state to become stale. When the tab becomes visible again, the timer shows an incorrect value that "jumps" to the correct time on the next tick. This is particularly impactful in an exam context where students rely on the timer for time management.

**Fix:** Add a `visibilitychange` listener that immediately recalculates `remaining` when the tab becomes visible: `setRemaining(deadline - (Date.now() + offsetRef.current))`.

---

### AGG-5: `compiler-client.tsx` — `handleLanguageChange` depends on `sourceCode` causing unnecessary re-creation [LOW/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:205`
**Confidence:** MEDIUM
**Agents agreeing:** CR-5, PERF-2

Carried from cycle 3. The `handleLanguageChange` callback depends on `sourceCode` in its dependency array, creating a new function reference on every keystroke. The function only uses `sourceCode` for a comparison.

**Fix:** Use a ref for `sourceCode` in the comparison.

---

### AGG-6: `compiler-client.tsx` — stdin has no `maxLength` [LOW/LOW]

**File:** `src/components/code/compiler-client.tsx:476`
**Confidence:** LOW
**Agents agreeing:** CR-6

Carried from cycle 3. The stdin `Textarea` has no `maxLength` attribute. A user could paste megabytes of data.

**Fix:** Add `maxLength={1_000_000}` to the stdin Textarea.

---

### AGG-7: `anti-cheat-monitor.tsx` — event listener re-registration gap [LOW/MEDIUM]

**File:** `src/components/exam/anti-cheat-monitor.tsx:162-242`
**Confidence:** MEDIUM
**Agents agreeing:** CR-7, SEC-4, DBG-4

When `reportEvent` or `flushPendingEvents` callbacks are recreated, the `useEffect` cleanup removes all 6 event listeners and re-adds them. During this gap, anti-cheat events are not detected.

**Fix:** Use ref-based callback pattern so event listeners are only registered once.

---

### AGG-8: `active-timed-assignment-sidebar-panel.tsx` — timer continues after all assignments expire [LOW/LOW]

**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:62-79`
**Confidence:** MEDIUM
**Agents agreeing:** PERF-3

Once the timer starts, it doesn't stop when all assignments expire. The `useEffect` only checks `hasActiveAssignment` on mount/dependency change, not inside the interval callback.

**Fix:** Inside the `setInterval` callback, check if all assignments have expired and clear the interval if so.

---

### AGG-9: `apiJson` helper is dead code — never adopted by any component [MEDIUM/LOW]

**File:** `src/lib/api/client.ts:61-80`
**Confidence:** HIGH
**Agents agreeing:** ARCH-1, DOC-1, CRITIC

The `apiJson` helper was added in cycle 3 but no component uses it. Having two approaches for the same problem (manual `response.ok` + `.json().catch()` vs `apiJson`) adds confusion.

**Fix:** Either adopt `apiJson` across components or remove it and update the JSDoc to reference the manual pattern.

---

## Deferred Items (Carried Forward)

### DEFER-1 (from cycle 3): Add unit tests for error handling in `discussion-vote-buttons.tsx` and `problem-submission-form.tsx` [MEDIUM/MEDIUM]

**Status:** Exit criterion met (TASK-2, TASK-3 deployed and stabilized). Should be picked up in a future cycle.

### DEFER-2 (from cycle 3): Add unit tests for `participant-anti-cheat-timeline.tsx` [LOW/LOW]

**Status:** Exit criterion met (TASK-7 implemented). Should be picked up in a future cycle.

### DEFER-3 (from cycle 3): `window.location.origin` used in `access-code-manager.tsx` and `workers-client.tsx` [LOW/MEDIUM]

**Status:** Requires server-side `appUrl` config. Low risk in current deployment.

### Prior deferred items maintained:
- DEFER-1 (prior): Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-2 (prior): SSE connection tracking eviction optimization
- DEFER-3 (prior): SSE connection cleanup test coverage
- D1 (prior): JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2 (prior): JWT callback DB query on every request — add TTL cache (MEDIUM)
- A19 (prior): `new Date()` clock skew risk in remaining routes (LOW)
- DEFER-20 (prior): Contest clarifications show raw userId instead of username
- DEFER-21 (prior): Duplicated visibility-aware polling pattern (partially addressed by TASK-7)
- DEFER-22 (prior): copyToClipboard dynamic import inconsistency (addressed in `recruiting-invitations-panel.tsx`, remains in `access-code-manager.tsx` as AGG-3)
- DEFER-23 (prior): Practice page Path B progress filter
- DEFER-24 (prior): Invitation URL uses window.location.origin

## New Deferred Items

### DEFER-4: Add unit tests for `invite-participants.tsx`, `access-code-manager.tsx`, and `countdown-timer.tsx` error handling and visibility behavior [MEDIUM/MEDIUM]

**Severity:** MEDIUM/MEDIUM
**Reason:** New error-handling fixes in this cycle need test coverage. Writing meaningful tests for async API response handling requires mocking `apiFetch`. Will add in a future cycle.
**Exit criterion:** After AGG-1, AGG-2, AGG-4 fixes are deployed and stabilized.

## Summary Statistics

| Category | Count |
|----------|-------|
| Total deduplicated findings | 9 |
| HIGH confidence findings | 5 |
| MEDIUM confidence findings | 3 |
| LOW confidence findings | 1 |
| Findings with 3+ agents agreeing | 5 |
| Carried forward from cycle 3 | 2 (AGG-5, AGG-6) |
