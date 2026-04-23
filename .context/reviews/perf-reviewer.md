# Performance Review — RPF Cycle 24

**Date:** 2026-04-22
**Base commit:** dbc0b18f

## PERF-1: `submission-overview.tsx` polls when dialog closed — carried as DEFER-41 [LOW/MEDIUM]

**File:** `src/components/lecture/submission-overview.tsx:128`

**Description:** Already tracked as DEFER-41. The M2 Dialog refactor is done but the component still mounts and polls when closed. The `useVisibilityPolling` callback fires and returns immediately due to the `openRef` guard, but this is still wasteful.

**Fix:** Conditionally mount the component only when `open` is true.

---

## Summary

- No new performance findings this cycle.
- Total new findings: 0
