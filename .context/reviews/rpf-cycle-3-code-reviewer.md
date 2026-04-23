# RPF Cycle 3 — Code Reviewer

**Date:** 2026-04-22
**Base commit:** 678f7d7d

## Findings

### CR-1: `SubmissionListAutoRefresh` `router.refresh()` never throws — backoff logic is dead code [MEDIUM/HIGH]

**File:** `src/components/submission-list-auto-refresh.tsx:38-44`
**Confidence:** HIGH

`router.refresh()` in Next.js App Router triggers a server component re-render. It does NOT throw on network errors or server failures — it silently fails or retries internally. The entire error-counting and exponential backoff mechanism on lines 27-29, 42-43 is dead code. The `errorCountRef` will always remain at 0 because `router.refresh()` never enters the `catch` block.

**Concrete failure scenario:** Server is overloaded and responses are timing out. The auto-refresh keeps hammering at the base interval (5s/10s) with no backoff, contributing to the load instead of backing off.

**Fix:** Replace `router.refresh()` with an actual `fetch()` call to a lightweight endpoint (e.g., the existing `/api/v1/time` or a submissions count endpoint). Only call `router.refresh()` when the fetch succeeds. This way, the `catch` block actually fires on network errors and the backoff logic works.

---

### CR-2: `contest-clarifications.tsx` polling interval creates and destroys `setInterval` on every visibility toggle [MEDIUM/MEDIUM]

**File:** `src/components/contest/contest-clarifications.tsx:94-118`
**Confidence:** HIGH

The `syncVisibility` function (lines 97-108) clears the interval when the page becomes hidden and creates a new one when it becomes visible. However, the `interval` variable is local to the `useEffect` closure, and the `visibilitychange` listener can fire multiple times rapidly. If `syncVisibility` is called twice with `"visible"` state before the first `setInterval` fires, two intervals are created (the second assignment overwrites `interval` but doesn't clear the first one).

**Concrete failure scenario:** User rapidly toggles between tabs. Two intervals are created, causing double fetches every 30 seconds.

**Fix:** Always clear the existing interval before creating a new one inside the `"visible"` branch. Or restructure to use a single interval that checks `document.visibilityState` before each tick (similar to how `SubmissionListAutoRefresh` does it).

---

### CR-3: `CompilerClient` test case `stdin` textarea not using `<Textarea>` component — inconsistent with rest of UI [LOW/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:466-483`
**Confidence:** MEDIUM

The stdin input uses a raw `<textarea>` with inline Tailwind styles instead of the shared `<Textarea>` component from `@/components/ui/textarea`. This means it misses consistent focus rings, border radius, disabled state styling, and theming support that the shared component provides.

**Fix:** Import and use `<Textarea>` from `@/components/ui/textarea` with the same props.

---

### CR-4: `recruiting-invitations-panel.tsx` `fetchData` has `stats` in dependency array causing infinite loop risk [MEDIUM/HIGH]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:110-134`
**Confidence:** MEDIUM

The `fetchData` `useCallback` has `stats` in its dependency array (line 134). Inside `fetchData`, `stats` is used as a fallback value on line 128: `setStats(json.data ?? stats)`. This creates a closure over the `stats` state object. Since `fetchData` is in the dependency array of the `useEffect` on line 136, and `fetchData` changes whenever `stats` changes, this can create an infinite loop: `fetchData` updates `stats` -> `fetchData` changes -> `useEffect` re-runs -> `fetchData` updates `stats` -> ...

In practice, this doesn't infinite-loop because `setStats(json.data ?? stats)` only triggers a re-render when the data actually changes (React's bailout optimization), but the dependency is still incorrect semantically.

**Fix:** Remove `stats` from the `fetchData` dependency array and use a functional update form `setStats(prev => json.data ?? prev)` instead, which avoids needing `stats` in the closure.

---

### CR-5: `compiler-client.tsx` `handleLanguageChange` has stale `sourceCode` in dependency array [LOW/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:187-203`
**Confidence:** MEDIUM

The `handleLanguageChange` callback depends on `sourceCode` (line 202), which means a new function is created on every keystroke in the code editor. While this works correctly, it's an unnecessary performance overhead since the function only uses `sourceCode` for a comparison (`sourceCode === "" || sourceCode === oldDefault`).

**Fix:** Use a ref for `sourceCode` in the comparison, or use `useCallback` with only `language` in deps and read `sourceCode` from a ref.

---

### CR-6: `contest-clarifications.tsx` `loadClarifications` fetch missing error status differentiation [LOW/LOW]

**File:** `src/components/contest/clarifications.tsx:77-92`
**Confidence:** LOW

The `loadClarifications` function throws a generic error on any non-ok response and shows a generic `t("fetchError")` toast. 401/403 errors (session expired) would show the same message as a 500 error, which is confusing.

**Fix:** Check `response.status` for auth-related codes and show an appropriate message or trigger a redirect.

---

### CR-7: `anti-cheat-monitor.tsx` `loadPendingEvents` does not validate stored JSON structure [LOW/MEDIUM]

**File:** `src/components/exam/anti-cheat-monitor.tsx:28-35`
**Confidence:** MEDIUM

`JSON.parse(raw)` on line 31 can return any JSON value. The function returns the parsed result without validating that it's actually an array of `PendingEvent` objects. If localStorage is corrupted or tampered with, subsequent code that iterates over the array (e.g., `pending.push(...)`) could fail.

**Fix:** Add a runtime type check after parsing: `return Array.isArray(parsed) ? parsed : []`.

---

## Verified Safe / No Issue Found

- `clipboard.ts` shared utility is well-implemented with proper fallback and cleanup
- `contest-layout.tsx` correctly uses `data-full-navigate` opt-in pattern
- `submission-detail-client.tsx` properly uses `formatScore` for locale-aware display
- All `localStorage.removeItem` calls in `use-source-draft.ts` are wrapped in try/catch
- `anti-cheat-monitor.tsx` privacy notice now uses `<Button>` component
