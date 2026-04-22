# Performance Review — RPF Cycle 11

**Date:** 2026-04-22
**Reviewer:** perf-reviewer
**Base commit:** 42ca4c9a

## Findings

### PERF-1: `accepted-solutions.tsx` useEffect re-runs on every render due to `pageSize` in dependency array — `pageSize` is state that never changes [LOW/LOW]

**File:** `src/components/problem/accepted-solutions.tsx:102`

**Description:** The `useEffect` on line 58-101 depends on `[problemId, sort, language, page, pageSize]`. However, `pageSize` is declared as `const [pageSize] = useState(10)` — it is never changed. Including it in the dependency array is harmless but unnecessary. More importantly, the effect has no `loading` state in its dependency array, which means `setLoading(true)` on line 62 could cause a re-render loop if `loading` were used in a selector. Currently this is benign.

**Fix:** Remove `pageSize` from the dependency array or add an eslint-disable comment explaining it is intentionally constant.

**Confidence:** LOW

---

### PERF-2: `recruiting-invitations-panel.tsx` fetches stats and invitations separately — could be parallelized [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:160-162`

**Description:** The `fetchData` callback on line 160 uses `Promise.all` which is correct. However, the individual fetch functions (`fetchInvitations` and `fetchStats`) each create their own `apiFetch` call independently. The invitations fetch includes an abort controller for cancellation, but the stats fetch does not. If the component unmounts during the stats fetch, the request continues unnecessarily. This is minor since the stats endpoint is lightweight.

**Fix:** Add abort signal support to `fetchStats` as well, or use a shared abort controller.

**Confidence:** LOW

---

### PERF-3: `contest-clarifications.tsx:79` and `contest-announcements.tsx:56` call `response.json()` on success path after `response.ok` check — no `.catch()` guard [LOW/MEDIUM]

**Files:**
- `src/components/contest/contest-clarifications.tsx:79`
- `src/components/contest/contest-announcements.tsx:56`

**Description:** After checking `response.ok`, these polling endpoints call `await response.json()` without a `.catch()` guard. On a 200 with a non-JSON body, `response.json()` throws SyntaxError. The outer catch block silently fails (only showing a toast on initial load), so the user experience impact is low. However, the thrown SyntaxError is an unnecessary exception that could be avoided.

**Fix:** Wrap in `.catch(() => ({ data: [] }))` to match the expected type structure.

**Confidence:** MEDIUM

---

## Final Sweep

The cycle 9 fixes are all in place and working correctly. The anti-cheat timeline polling fix properly preserves loaded pages. The `useVisibilityPolling` hook is efficient with its shared polling approach. The `normalizePage` upper bound prevents DoS via extremely large offsets. The `setTimeout`-based countdown timer is correct. The SSE events route has proper shared polling. Performance of the codebase is generally good. The findings this cycle are low severity — no critical performance regressions.
