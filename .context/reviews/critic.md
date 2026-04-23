# Critic Review — RPF Cycle 30

**Date:** 2026-04-23
**Reviewer:** critic
**Base commit:** 31afd19b

## Previously Fixed Items (Verified)

- Clarification i18n (AGG-1): Fixed (commit 7e0b3bb8). Verified Korean keys exist in `messages/ko.json`.
- Provider error sanitization (AGG-2): Fixed (commit 93beb49d). Verified no `${text}` in thrown errors.
- useVisibilityPolling setTimeout (AGG-3): Fixed (commit 60f24288). Verified recursive setTimeout pattern.
- Progress bar aria-label (AGG-4): Fixed (commit 3530a989). Verified `aria-label={tNav("progress")}`.

## CRI-1: Exam countdown timer uses `setInterval` — the one place where timer accuracy matters most [MEDIUM/MEDIUM]

**File:** `src/components/exam/countdown-timer.tsx:117`

From a multi-perspective critique:

1. **Consistency perspective:** The codebase has converged on recursive `setTimeout`. The countdown timer is now the sole exception among client-side timers.
2. **Reliability perspective:** This is the most important timer in the application. Exam countdown accuracy directly impacts students. `setInterval` catch-up behavior in background tabs is a real risk.
3. **Risk perspective:** If any timer should be using the most robust pattern, it's this one. The stakes are higher than for polling hooks.
4. **Architecture perspective:** The `useVisibilityPolling` hook was migrated in the last cycle. The countdown timer is a simpler migration since it has a fixed 1000ms interval and no jitter mechanism.

The `visibilitychange` handler is a reactive safety net but does not prevent the catch-up behavior from occurring in the first place. Recursive `setTimeout` is inherently immune to catch-up because the next tick is only scheduled after the current one completes.

**Fix:** Migrate to recursive `setTimeout`, matching the established pattern.

---

## CRI-2: Chat widget `sendMessage` dependency instability [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:215`

The `sendMessage` callback includes `messages` in its dependency array, causing unnecessary callback recreation on every message. This is a minor performance concern but not a functional issue.

**Fix:** Stabilize with a messages ref.

---

## Critic Findings (carried/deferred)

### CRI-CARRIED-1: Contest layout forced navigation — carried from DEFER-18
