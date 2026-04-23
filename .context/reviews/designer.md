# UI/UX Review — RPF Cycle 24

**Date:** 2026-04-22
**Base commit:** dbc0b18f

## DES-1: `submission-overview.tsx` silent failure gives no user feedback on error [MEDIUM/MEDIUM]

**File:** `src/components/lecture/submission-overview.tsx:91`

**Description:** When the submissions API returns a non-OK response, the dialog shows stale/empty data with no error indication. The user has no way to know that the data may be outdated or missing. On initial load, an error toast is shown. But on subsequent polling refreshes, errors are silently swallowed.

**Concrete UX impact:** A contest instructor sees "0%" acceptance rate because the API is failing, and assumes students are performing poorly rather than the data being stale.

**Fix:** Show a subtle error indicator (e.g., "Unable to refresh" text or a warning icon) when the last poll failed.

---

## Summary

- MEDIUM: 1 (DES-1)
- Total new findings: 1
