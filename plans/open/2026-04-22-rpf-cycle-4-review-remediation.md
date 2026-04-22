# RPF Cycle 4 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/rpf-cycle-4-aggregate.md`
**Status:** COMPLETED

## Task List

### TASK-1: Fix `invite-participants.tsx` — add `.catch()` to `res.json()` on error path [AGG-1] — Priority: HIGH

**File:** `src/components/contest/invite-participants.tsx:78`
**Severity:** MEDIUM/MEDIUM (3-agent signal)

- [x] Replace `const data = await res.json();` with `const data = await res.json().catch(() => ({}));` on line 78
- [ ] Verify error handling still works for JSON error responses
- [ ] Verify fallback for non-JSON error responses shows generic error

---

### TASK-2: Fix `access-code-manager.tsx` — add `.catch()` to `res.json()` on both paths [AGG-2] — Priority: HIGH

**File:** `src/components/contest/access-code-manager.tsx:42,88`
**Severity:** MEDIUM/MEDIUM (3-agent signal)

- [x] Line 42 (`fetchCode`): Add `.catch(() => ({}))` after `res.json()`
- [x] Line 88 (`handleGenerate`): Add `.catch(() => ({}))` after `res.json()`
- [ ] Verify both paths handle malformed JSON gracefully

---

### TASK-3: Fix `access-code-manager.tsx` — convert dynamic clipboard import to static [AGG-3] — Priority: MEDIUM

**File:** `src/components/contest/access-code-manager.tsx:61`
**Severity:** LOW/MEDIUM (3-agent signal)

- [x] Add `import { copyToClipboard } from "@/lib/clipboard";` at the top of the file
- [x] Remove the `const { copyToClipboard } = await import("@/lib/clipboard");` line from `copyValue` function
- [ ] Make `copyValue` synchronous (remove `async` if possible, or keep for `copyToClipboard` compatibility)
- [ ] Verify copy functionality still works

---

### TASK-4: Fix `countdown-timer.tsx` — add visibilitychange listener to prevent timer drift [AGG-4] — Priority: HIGH

**File:** `src/components/exam/countdown-timer.tsx:100`
**Severity:** MEDIUM/HIGH (5-agent signal — highest signal finding)

- [x] Add a `visibilitychange` event listener inside the existing `useEffect` (or a new one)
- [x] When `document.visibilityState === "visible"`, immediately recalculate: `setRemaining(deadline - (Date.now() + offsetRef.current))`
- [x] Also re-check threshold announcements and expired state
- [x] Clean up the listener in the effect cleanup function
- [ ] Verify timer displays correct time after tab switch

---

### TASK-5: Fix `compiler-client.tsx` — use ref for `sourceCode` in `handleLanguageChange` [AGG-5] — Priority: LOW

**File:** `src/components/code/compiler-client.tsx:205`
**Severity:** LOW/MEDIUM (2-agent signal, carried from cycle 3)

- [x] Add a `sourceCodeRef = useRef(sourceCode)` and update it in a `useEffect`
- [x] In `handleLanguageChange`, read `sourceCode` from the ref instead of the closure
- [x] Remove `sourceCode` from `handleLanguageChange` dependency array
- [ ] Verify language switching still correctly replaces template code

---

### TASK-6: Add `maxLength` to `compiler-client.tsx` stdin Textarea [AGG-6] — Priority: LOW

**File:** `src/components/code/compiler-client.tsx:476`
**Severity:** LOW/LOW (2-agent signal, carried from cycle 3)

- [x] Add `maxLength={1_000_000}` to the stdin `Textarea` component
- [ ] Verify large inputs are truncated at the client side

---

### TASK-7: Fix `anti-cheat-monitor.tsx` — use ref-based callbacks to prevent listener re-registration [AGG-7] — Priority: MEDIUM

**File:** `src/components/exam/anti-cheat-monitor.tsx:162-242`
**Severity:** LOW/MEDIUM (3-agent signal)

- [x] Create refs for `reportEvent` and `flushPendingEvents` callbacks
- [x] Update the refs whenever the callbacks change (like `useVisibilityPolling`'s `savedCallback` pattern)
- [x] Use the refs inside the event handlers instead of the direct callbacks
- [x] Remove `reportEvent` and `flushPendingEvents` from the `useEffect` dependency array
- [ ] Verify anti-cheat events are still captured after callback changes

---

### TASK-8: Fix `active-timed-assignment-sidebar-panel.tsx` — stop timer when all assignments expire [AGG-8] — Priority: LOW

**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:62-79`
**Severity:** LOW/LOW (1-agent signal)

- [x] Inside the `setInterval` callback, check if all assignments have expired (`new Date(assignment.deadline).getTime() <= Date.now()`)
- [x] If all expired, clear the interval and update `nowMs` one final time
- [ ] Verify the timer stops ticking after all assignments expire

---

### TASK-9: Resolve `apiJson` dead code — either adopt or remove [AGG-9] — Priority: LOW

**File:** `src/lib/api/client.ts:61-80`
**Severity:** MEDIUM/LOW (3-agent signal, low severity)

- [x] Decision: Remove `apiJson` helper since no component uses it and the manual pattern is well-established
- [x] If removing: Delete the `apiJson` function and its JSDoc from `src/lib/api/client.ts`
- [x] Update the `apiFetch` JSDoc to reference the `.json().catch(() => ({}))` pattern directly
- [ ] If keeping: Create a follow-up task to migrate components to `apiJson`

---

## Deferred Items

### DEFER-4: Add unit tests for `invite-participants.tsx`, `access-code-manager.tsx`, and `countdown-timer.tsx` error handling and visibility behavior [TE-1, TE-2, TE-3]

**Severity:** MEDIUM/MEDIUM
**Reason:** The code fixes in TASK-1, TASK-2, TASK-4 must be stabilized first. Writing meaningful tests for async API response handling requires mocking `apiFetch` which is time-consuming. Will add in a future cycle.
**Exit criterion:** After TASK-1, TASK-2, TASK-4 are deployed and stabilized.

### DEFER-5 (from cycle 3): Add unit tests for `discussion-vote-buttons.tsx` and `problem-submission-form.tsx` error handling

**Severity:** MEDIUM/MEDIUM
**Reason:** Exit criterion met (TASK-2, TASK-3 from cycle 3 are deployed). Will pick up in a future cycle.
**Exit criterion:** Ready to implement now — scheduled for next test-focused cycle.

### DEFER-6 (from cycle 3): Add unit tests for `participant-anti-cheat-timeline.tsx`

**Severity:** LOW/LOW
**Reason:** Exit criterion met (TASK-7 from cycle 3 is implemented). Will pick up in a future cycle.
**Exit criterion:** Ready to implement now — scheduled for next test-focused cycle.

## Previously Deferred Items (Maintained)

- DEFER-1 (prior): Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-2 (prior): SSE connection tracking eviction optimization
- DEFER-3 (prior): SSE connection cleanup test coverage
- D1 (prior): JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2 (prior): JWT callback DB query on every request — add TTL cache (MEDIUM)
- A19 (prior): `new Date()` clock skew risk in remaining routes (LOW)
- DEFER-20 (prior): Contest clarifications show raw userId instead of username
- DEFER-21 (prior): Duplicated visibility-aware polling pattern (partially addressed by TASK-7)
- DEFER-22 (prior): copyToClipboard dynamic import inconsistency (addressed in `recruiting-invitations-panel.tsx`, will be resolved by TASK-3)
- DEFER-23 (prior): Practice page Path B progress filter
- DEFER-24 (prior): Invitation URL uses window.location.origin
