# RPF Cycle 4 — Code Reviewer

**Date:** 2026-04-22
**Base commit:** 5d89806d

## Findings

### CR-1: `invite-participants.tsx` line 78 — `res.json()` called on error response without `.catch()` [MEDIUM/MEDIUM]

**File:** `src/components/contest/invite-participants.tsx:78`
**Confidence:** HIGH

In the `handleInvite` function, when `!res.ok`, the code calls `await res.json()` without `.catch()`. If the server returns a non-JSON body (e.g., 502 HTML from nginx), this will throw a SyntaxError that gets caught by the outer `catch` block and shows a generic `t("inviteFailed")` toast instead of a meaningful error message.

This is the same class of bug that was fixed in cycle 3 for `discussion-vote-buttons.tsx`, `problem-submission-form.tsx`, and others, but this file was missed.

**Fix:** Replace `const data = await res.json();` with `const data = await res.json().catch(() => ({}));` on line 78, consistent with the pattern established by the `apiJson` helper and the `.json().catch(() => ({}))` pattern used elsewhere.

---

### CR-2: `access-code-manager.tsx` lines 42, 88 — `res.json()` called without `.catch()` on both fetch and generate paths [MEDIUM/MEDIUM]

**File:** `src/components/contest/access-code-manager.tsx:42,88`
**Confidence:** HIGH

Same class of issue as CR-1. In `fetchCode` (line 42) and `handleGenerate` (line 88), `res.json()` is called inside the `if (res.ok)` block but without `.catch()`. While the `if (res.ok)` guard makes it less likely that the body is non-JSON, a malformed API response or proxy error could still produce non-JSON in a 200 body. More importantly, the current pattern is inconsistent with the project convention established in cycle 3.

**Fix:** Add `.catch(() => ({}))` after both `res.json()` calls, or use the `apiJson` helper.

---

### CR-3: `access-code-manager.tsx` line 61 — dynamic `import("@/lib/clipboard")` should be static [LOW/MEDIUM]

**File:** `src/components/contest/access-code-manager.tsx:61`
**Confidence:** MEDIUM

The `copyValue` function uses `await import("@/lib/clipboard")` (dynamic import). This was flagged in cycle 3 as SEC-2 for `recruiting-invitations-panel.tsx` and was fixed there with a static import. The same pattern remains in `access-code-manager.tsx`. The clipboard utility is small and always client-side; dynamic import adds unnecessary async overhead and could be blocked by strict CSP.

**Fix:** Replace `const { copyToClipboard } = await import("@/lib/clipboard")` with a static `import { copyToClipboard } from "@/lib/clipboard"` at the top of the file, consistent with the fix applied to `recruiting-invitations-panel.tsx`.

---

### CR-4: `countdown-timer.tsx` line 100 — `setInterval` does not pause when page is hidden [MEDIUM/MEDIUM]

**File:** `src/components/exam/countdown-timer.tsx:100`
**Confidence:** HIGH

The `setInterval` on line 100 ticks every second regardless of document visibility. When the page is hidden, the interval continues to fire and update state, which causes unnecessary re-renders. Unlike the contest clarifications and announcements components (which use `useVisibilityPolling`), this component does not check `document.visibilityState`.

Additionally, if the browser throttles the interval in background tabs (common behavior), the remaining time display can drift from the actual deadline, since the offset is computed once on mount and never recalculated.

**Fix:** Either check `document.visibilityState` before each tick (like `SubmissionListAutoRefresh` does), or add a `visibilitychange` listener that recalculates the remaining time when the tab becomes visible again. This would also be a good candidate for `useVisibilityPolling` if the timer were refactored to be fetch-based.

---

### CR-5: `compiler-client.tsx` line 205 — `handleLanguageChange` depends on `sourceCode` causing unnecessary re-creation [LOW/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:205`
**Confidence:** MEDIUM (same as CR-5 from cycle 3, still unfixed)

The `handleLanguageChange` callback depends on `sourceCode` in its dependency array, which means a new function is created on every keystroke. The function only uses `sourceCode` for a comparison (`sourceCode === "" || sourceCode === oldDefault`). This is the same finding as cycle 3 CR-5, carried forward.

**Fix:** Use a ref for `sourceCode` in the comparison, or use `useCallback` with only `language` in deps and read `sourceCode` from a ref.

---

### CR-6: `compiler-client.tsx` stdin has no `maxLength` — no client-side size limit [LOW/LOW]

**File:** `src/components/code/compiler-client.tsx:476`
**Confidence:** LOW (same as SEC-5 from cycle 3, still unfixed)

The stdin `Textarea` has no `maxLength` attribute. A user could paste megabytes of data, which would be sent to the `/api/v1/compiler/run` endpoint. Server-side validation should catch this, but a client-side limit provides better UX.

**Fix:** Add a reasonable `maxLength` (e.g., 1MB / 1_000_000 characters) to the stdin Textarea.

---

### CR-7: `anti-cheat-monitor.tsx` line 162-242 — multiple event listeners re-registered on every `reportEvent` or `flushPendingEvents` change [LOW/MEDIUM]

**File:** `src/components/exam/anti-cheat-monitor.tsx:162`
**Confidence:** MEDIUM

The third `useEffect` (lines 162-242) depends on `[enabled, flushPendingEvents, reportEvent, resolvedWarningMessage, showPrivacyNotice]`. Since `reportEvent` and `flushPendingEvents` are `useCallback`s that depend on `assignmentId` and `sendEvent`, they are stable as long as `assignmentId` doesn't change. However, if any of these callbacks are recreated (e.g., due to `sendEvent` changing), all 6 event listeners (`visibilitychange`, `blur`, `copy`, `paste`, `contextmenu`, `online`) will be removed and re-added, which can cause brief gaps in anti-cheat monitoring coverage.

**Fix:** Use refs for the callback dependencies inside the event handlers (similar to `useVisibilityPolling`'s `savedCallback` pattern) so the effect only re-runs when `enabled` or `showPrivacyNotice` change.

---

## Verified Safe / No New Issue Found

- `submission-list-auto-refresh.tsx` — properly uses `apiFetch("/api/v1/time")` for error-detectable backoff (cycle 3 fix confirmed working)
- `contest-clarifications.tsx` — properly uses `useVisibilityPolling` (cycle 3 fix confirmed)
- `recruiting-invitations-panel.tsx` — `stats` removed from dependency array with functional update pattern (cycle 3 fix confirmed)
- `problem-submission-form.tsx` — `response.ok` check before `.json()` with `.catch()` pattern (cycle 3 fix confirmed)
- `discussion-vote-buttons.tsx` — `response.ok` check before `.json()` with `.catch()` pattern (cycle 3 fix confirmed)
- `compiler-client.tsx` — `response.ok` check before `.json()` with proper error extraction (cycle 3 fix confirmed)
- `apiJson` helper in `src/lib/api/client.ts` — working correctly with `response.ok` first, then `.json()`
- `leaderboard-table.tsx` — response shape validation before setting state
- `contest-quick-stats.tsx` — `Number.isFinite` validation on all numeric fields
- All `dangerouslySetInnerHTML` uses are protected with DOMPurify or `safeJsonForScript`
