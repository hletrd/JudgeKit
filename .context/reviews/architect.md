# Architecture Review — RPF Cycle 30

**Date:** 2026-04-23
**Reviewer:** architect
**Base commit:** 31afd19b

## Previously Fixed Items (Verified)

- Clarification i18n: Fixed (commit 7e0b3bb8)
- Provider error sanitization: Fixed (commit 93beb49d)
- useVisibilityPolling setTimeout: Fixed (commit 60f24288)
- Progress bar aria-label: Fixed (commit 3530a989)

## ARCH-1: `countdown-timer.tsx` is the last client-side timer using `setInterval` — architectural inconsistency [MEDIUM/MEDIUM]

**File:** `src/components/exam/countdown-timer.tsx:117`

The codebase has converged on recursive `setTimeout` as the architectural standard for all timer-based effects. The `useVisibilityPolling` hook was migrated in cycle 29, and the contest-replay component in cycle 28. The countdown timer is now the only remaining client-side timer using `setInterval`.

This is an exam countdown timer — arguably the most important timer in the application from a user impact perspective. Students rely on accurate time remaining during proctored exams. The architectural inconsistency is more concerning here than in the polling hook because:

1. The countdown timer's accuracy directly affects student experience during high-stakes assessments
2. `setInterval` catch-up behavior in background tabs can cause momentary incorrect display
3. The `visibilitychange` handler provides a safety net but is reactive, not preventive

**Fix:** Migrate to recursive `setTimeout` to complete the architectural convergence on this timer pattern.

---

## ARCH-2: Chat widget `sendMessage` has unstable `messages` dependency causing callback churn [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:215`

The `sendMessage` useCallback includes `messages` in its dependency array. Since `messages` state changes on every sent/received message, the callback is recreated frequently, causing downstream `handleSend` and `handleKeyDown` to also be recreated. This is a minor architectural concern about unnecessary re-renders, not a functional bug.

**Fix:** Use a ref for messages within the callback to stabilize the dependency array.

---

## Architectural Findings (carried/deferred)

### ARCH-CARRIED-1: Inconsistent createApiHandler usage — carried from DEFER-17
### ARCH-CARRIED-2: Duplicated visibility-aware polling pattern — carried from DEFER-21
