# Performance Review — RPF Cycle 14

**Date:** 2026-04-22
**Reviewer:** perf-reviewer
**Base commit:** 023ae5d4

## Previously Fixed Items (Verified)

- PERF-2 from cycle 13 (submission-overview.tsx unguarded res.json()): Fixed — now uses `.catch(() => ({ data: {} }))`

## Findings

### PERF-1: Anti-cheat dashboard polling replaces all data on every tick [MEDIUM/LOW]

**File:** `src/components/contest/anti-cheat-dashboard.tsx:124-135`

**Description:** Carried from cycle 13. The `fetchEvents` callback replaces the entire events array on every polling tick. When the user has loaded beyond the first page, extra pages are preserved via `prev.slice(PAGE_SIZE)`, but the entire array is still recreated, causing unnecessary React re-renders even when data hasn't changed.

**Fix:** Add shallow comparison before `setEvents()` to avoid re-renders when data is identical.

**Confidence:** MEDIUM

---

### PERF-2: `problem-import-button.tsx` parses uploaded JSON without size limit [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:22-23`

**Description:** Carried from cycle 13 (PERF-3). No file size check before `file.text()` loads the entire file into memory. A large file would freeze the browser tab.

**Fix:** Add client-side file size limit (e.g., 10MB).

**Confidence:** HIGH

---

### PERF-3: `contest-join-client.tsx` uses 1-second `setTimeout` delay before navigation [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:57`

**Description:** After a successful contest join, the code waits 1 second with `await new Promise((resolve) => setTimeout(resolve, 1000))` before navigating. This adds a full second of perceived latency. The success animation is shown during this time.

**Fix:** Consider reducing to 500ms or using `startTransition` for the navigation.

**Confidence:** LOW

---

### PERF-4: `compiler-client.tsx:287` — unguarded `res.json()` adds exception overhead [LOW/LOW]

**File:** `src/components/code/compiler-client.tsx:287`

**Description:** After a successful compile request, `res.json()` is called without `.catch()`. If the response is non-JSON, a SyntaxError is thrown and caught by the outer catch. The exception path has measurable overhead.

**Fix:** Add `.catch(() => ({}))` for consistency.

**Confidence:** LOW

---

## Final Sweep

No critical performance findings. Main concerns:
1. Anti-cheat dashboard polling (carried from cycle 13).
2. Problem import file size validation (carried from cycle 13).
3. Minor: 1-second delay in contest join, exception overhead from unguarded `res.json()`.
