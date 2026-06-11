# Debugger — Cycle 22 (Fresh)

**Date:** 2026-04-20
**Base commit:** e80d2746

## Findings

### DBG-1: `access-code-manager.tsx` `fetchCode` silently swallows errors and non-OK responses [LOW/MEDIUM]

**File:** `src/components/contest/access-code-manager.tsx:38-48`
**Description:** The `fetchCode` callback has an empty `catch` block with only an `/* ignore */` comment, and the `if (res.ok)` check does nothing on failure. If the API returns a 403 (no permission) or 500 (server error), the user sees an empty card with no error indication.
**Concrete failure scenario:** A user who has lost access to a contest (e.g., role change) opens the access code panel. The API returns 403, but the component silently shows nothing. The user thinks the feature is broken.
**Fix:** Add error handling: show a toast error on catch and on non-OK responses, matching the pattern in `handleGenerate`.
**Confidence:** MEDIUM

### DBG-2: `use-unsaved-changes-guard.ts` `toHistoryStateValue` does not validate input type [LOW/LOW]

**File:** `src/hooks/use-unsaved-changes-guard.ts:37-43`
**Description:** The function uses `return value as HistoryStateValue;` which is an unsafe cast. If `value` is a primitive (string, number, boolean), the cast succeeds at runtime but subsequent spread operations on the "object" will silently produce unexpected results.
**Concrete failure scenario:** If `window.history.state` is a string (e.g., set by a third-party script), `toHistoryStateValue("foo")` returns `"foo" as Record<string, unknown>`. When this is spread in `wrapState`, it produces `{}` because spreading a string is a no-op in object context. The guard index is then lost.
**Fix:** Add `if (typeof value !== "object" || value === null) return {};` before the cast.
**Confidence:** LOW

## Verified Safe

- `CountdownTimer` properly handles the server time offset via the `/api/v1/time` endpoint.
- `CountdownTimer` cleans up its interval on unmount.
- All clipboard operations have proper error handling (the cycle-19 AGG-2 fix is confirmed working).
- `AppSidebar` dead code from submissions removal was cleaned up (cycle-21 M2).
- Exam submission `submittedAt` uses `getDbNowUncached()` for clock-skew prevention (cycle-8 AGG-1 fix confirmed).
