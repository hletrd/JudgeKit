# Debugger Review — Cycle 13/100

**Reviewer:** debugger (manual, single-agent)
**Date:** 2026-05-08
**HEAD:** b3c16d3a
**Scope:** Latent bug surface, failure modes, timer leaks, race conditions, regressions

---

## NEW FINDINGS

### C13-DB-1 — In-flight fetch promises continue after component unmount in several components [LOW]
- **Severity:** LOW
- **Confidence:** HIGH
- **Files:** `language-config-table.tsx:132`, `submission-overview.tsx:90`, `accepted-solutions.tsx:72`, `submission-detail-client.tsx:131`
- **Problem:** These components do not abort fetch requests on cleanup. The promise resolves after unmount and calls `setState` on an unmounted component. React logs: "Warning: Can't perform a React state update on an unmounted component."
- **Failure scenario:** User navigates away from the languages admin page before image status loads. The fetch completes and calls `setImageInfo`, `setStaleCount`, etc. on the unmounted component.
- **Fix:** Add AbortController to each fetch and abort in effect cleanup.

### C13-DB-2 — `AcceptedSolutions` rapid filter changes spawn concurrent fetches [LOW]
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/problem/accepted-solutions.tsx:58-105`
- **Problem:** When sort, language, or page changes rapidly, each change triggers a new fetch. The `cancelled` flag prevents stale results from updating state, but all fetches still execute, wasting bandwidth and connection slots.
- **Fix:** Abort the previous fetch before starting a new one.

## Regressions Checked

| Fix | Status |
|---|---|
| CountdownTimer deadline reactivity | No regression — correctly resets on deadline change |
| CountdownTimer staggered timer leak | No regression — timers tracked in ref and cleared |
| Anti-cheat heartbeat guard | No regression — `isHeartbeatActiveRef` prevents stale callbacks |
| Judge deregister JSON guard | No regression — try/catch properly returns 400 |
| use-visibility-polling jitter cleanup | No regression — jitter timer cleared on cleanup |

## Summary

No regressions from prior fixes. Two new LOW-severity cleanup gaps identified, both involving missing AbortController cleanup on fetch calls. These are hygiene issues rather than functional bugs.
