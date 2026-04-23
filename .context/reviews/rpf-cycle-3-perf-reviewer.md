# RPF Cycle 3 — Performance Reviewer

**Date:** 2026-04-22
**Base commit:** 678f7d7d

## Findings

### PERF-1: `SubmissionListAutoRefresh` creates and destroys `setInterval` on every tick — O(n) timer churn [MEDIUM/MEDIUM]

**File:** `src/components/submission-list-auto-refresh.tsx:51-59`
**Confidence:** HIGH

The `scheduleNext` function (lines 51-59) creates a new `setInterval` on every tick, then immediately clears it. This is equivalent to `setTimeout` but with unnecessary `setInterval` overhead. The pattern is:

1. `setInterval(tick, interval)` — creates timer
2. Tick fires
3. `clearInterval(intervalRef.current)` — destroys timer
4. `scheduleNext()` — creates new timer with potentially different interval

This is effectively `setTimeout` with extra steps. Each tick creates and destroys a timer, which is more expensive than just using `setTimeout`.

**Fix:** Replace `setInterval`/`clearInterval` with `setTimeout`/`clearTimeout`. This is simpler and avoids the overhead of creating and destroying interval timers.

---

### PERF-2: `contest-clarifications.tsx` `loadClarifications` in `useCallback` has `t` (translations function) as dependency [LOW/LOW]

**File:** `src/components/contest/contest-clarifications.tsx:92`
**Confidence:** LOW

The `t` function from `useTranslations` is included in the dependency array of `loadClarifications`. If `t` changes reference on re-render (which depends on the `next-intl` implementation), it would cause `loadClarifications` to be recreated, which would restart the polling `useEffect`. This is likely stable in practice but worth noting.

**Fix:** If profiling shows unnecessary re-renders, consider extracting the error message lookup outside the callback or memoizing the callback differently.

---

### PERF-3: `recruiting-invitations-panel.tsx` dynamic `import()` for clipboard on every copy click [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:183,208,310`
**Confidence:** MEDIUM

Each clipboard copy operation dynamically imports `@/lib/clipboard`. While Vite/webpack caches the module after the first import, the dynamic `import()` still creates a Promise and goes through the module resolution path on every click. This is unnecessary overhead.

**Fix:** Use a static import at the top of the file.

---

### PERF-4: `compiler-client.tsx` `handleLanguageChange` creates new function on every keystroke [LOW/LOW]

**File:** `src/components/code/compiler-client.tsx:187-203`
**Confidence:** HIGH (same as CR-5)

The `sourceCode` state in the dependency array of `handleLanguageChange` causes the callback to be recreated on every keystroke in the code editor. This is unnecessary since the comparison `sourceCode === "" || sourceCode === oldDefault` only matters when the user actually changes the language dropdown.

**Fix:** Read `sourceCode` from a ref instead of including it in the dependency array.

---

### PERF-5: SSE events route `queryFullSubmission` runs without `sourceCode: false` for re-auth path [LOW/MEDIUM]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:321-345`
**Confidence:** MEDIUM

In the `sendTerminalResult` function (line 321), `queryFullSubmission(id)` is called when the SSE determines a submission has reached a terminal state. However, `queryFullSubmission` (line 463) does NOT exclude `sourceCode` from its columns. The full source code is fetched and then serialized into the SSE event data. For submissions with large source files (100KB+), this adds unnecessary latency to the SSE response and wastes bandwidth.

Meanwhile, in the `judge/poll/route.ts`, the equivalent query explicitly sets `sourceCode: false`.

**Fix:** Add `columns: { sourceCode: false }` to the `queryFullSubmission` query, or add a column exclusion if the client doesn't need sourceCode in SSE events.

---

## Verified Safe / No Issue Found

- `contest-layout.tsx` no longer forces full page reloads for all links (fixed in cycle 2)
- `SubmissionListAutoRefresh` properly checks `document.visibilityState` before refreshing
- `use-source-draft.ts` has proper debounced persistence (500ms)
