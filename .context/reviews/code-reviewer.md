# Code Review — RPF Cycle 30

**Date:** 2026-04-23
**Reviewer:** code-reviewer
**Base commit:** 31afd19b

## Previously Fixed Items (Verified in Current Code)

- AGG-1 (clarification quick-answer i18n): Fixed in commit 7e0b3bb8. Verified `t("quickYesAnswer")`, `t("quickNoAnswer")`, `t("quickNoCommentAnswer")` on lines 290, 293, 296.
- AGG-2 (chat widget provider error sanitization): Fixed in commit 93beb49d. Verified `throw new Error(`OpenAI API error ${response.status}`)` without `${text}` at lines 103, 138, 207, 260, 341, 403.
- AGG-3 (useVisibilityPolling setTimeout): Fixed in commit 60f24288. Verified recursive `setTimeout` pattern with `cancelled` flag.
- AGG-4 (aria-label on progress bar): Fixed in commit 3530a989. Verified `aria-label={tNav("progress")}` on line 172.

## CR-1: `countdown-timer.tsx` uses `setInterval` instead of recursive `setTimeout` [MEDIUM/MEDIUM]

**File:** `src/components/exam/countdown-timer.tsx:117`

The exam countdown timer uses `setInterval(recalculate, 1000)` on line 117. The codebase has established recursive `setTimeout` as the standard pattern for all timer-based effects. The `useVisibilityPolling` hook was migrated in cycle 29 (commit 60f24288), and the contest-replay component was migrated in cycle 28 (commit 9cc30d51). The countdown timer is the last remaining client-side timer using `setInterval`.

The `visibilitychange` handler (line 122) mitigates most drift, but `setInterval` can still cause catch-up behavior during the brief window between interval firing and visibility change handler running. This is especially important for exam countdown timers where accuracy is critical — students rely on precise time remaining.

**Concrete failure scenario:** A student switches to another browser tab for 10 seconds during an exam. When they return, the `setInterval` may have accumulated a few extra ticks that fire in rapid succession before the `visibilitychange` handler clears and recalculates. This could cause a momentary flash of incorrect time remaining.

**Fix:** Migrate to recursive `setTimeout` pattern, matching the pattern in `useVisibilityPolling`:

```typescript
function scheduleNext() {
  timerId = setTimeout(() => {
    if (cancelled) return;
    recalculate();
    scheduleNext();
  }, 1000);
}
```

---

## CR-2: Chat widget `sendMessage` callback has unstable dependency array causing unnecessary re-renders [LOW/MEDIUM]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:135-215`

The `sendMessage` callback defined on line 135 includes `messages` in its dependency array (line 215). Since `messages` is a state array that changes every time a message is sent or received, the `sendMessage` callback is recreated on every message change. This causes:

1. The `handleSend` callback (line 217) to be recreated, which triggers re-renders
2. The `handleKeyDown` callback (line 221) to be recreated
3. Any child components receiving these callbacks to re-render

The `messages` dependency is used only to compute `newMessages` (line 140) and `recentMessages` (line 147). A ref-based approach would avoid the re-creation.

**Fix:** Use a ref for the messages array in the callback:
```typescript
const messagesRef = useRef(messages);
useEffect(() => { messagesRef.current = messages; }, [messages]);
// Then in sendMessage, use messagesRef.current instead of messages
```
This would remove `messages` from the dependency array of `sendMessage`.

---

## Verified Safe / No Issue

- All `.json()` patterns follow "parse once, then branch" or use `apiFetchJson` with `.catch()`
- `localStorage` write operations all have try/catch guards
- `console.error` calls all gated behind `process.env.NODE_ENV === "development"`
- No `as any`, `@ts-ignore`, or `@ts-expect-error` in production code
- No silently swallowed catch blocks (all have comments or are appropriate)
- Korean letter-spacing compliance maintained
- Clarification i18n fix verified with `t("quickYesAnswer")` etc.
- Provider error sanitization verified — no `${text}` in thrown errors
- useVisibilityPolling verified — recursive `setTimeout` with `cancelled` flag
