# Cycle 45 — Verifier

**Date:** 2026-04-23
**Base commit:** d96a984f

## Evidence-Based Verification

### V-1: Verified — Cycle 44 fixes remain intact [VERIFIED]

1. `validateAssignmentSubmission` uses `getDbNowUncached()` at line 210 — confirmed
2. Map.get() non-null assertions removed from `contest-scoring.ts`, `submissions.ts`, `contest-analytics.ts` — confirmed
3. All prior fixes from cycles 37-43 remain intact — confirmed by code inspection

### V-2: New finding — `getStudentProblemStatuses` still uses a two-query pattern that could miss in-flight submissions [LOW/LOW]

**File:** `src/lib/assignments/submissions.ts:342-387`

The function runs two separate queries:
1. Fetch assignment problem rows
2. Fetch student submissions

Between the two queries, a new submission could be inserted. The function would then report a problem as "untried" even though the student just submitted. This is a TOCTOU issue, but the impact is minimal — the status is display-only and will be correct on the next page load.

**Fix:** Not needed for the current use case. The stale data is corrected on refresh.

### V-3: Verified — `safeJsonForScript` correctly prevents XSS in JSON-LD [VERIFIED]

**File:** `src/components/seo/json-ld.tsx:11-15`

Tested the escaping logic:
- `</script>` → `<\/script>` (prevents tag breakout)
- `<!--` → `<\!--` (prevents HTML comment breakout)
- `JSON.stringify` handles the rest (escapes `"`, `\`, control characters)

The fix from cycle 40 (adding the `<!--` escape) remains intact.

---

## Summary

| ID | Severity/Confidence | Description |
|----|----|----|
| V-1 | VERIFIED | Cycle 44 fixes intact |
| V-2 | LOW/LOW | TOCTOU in getStudentProblemStatuses (display-only, self-correcting) |
| V-3 | VERIFIED | safeJsonForScript XSS prevention intact |
