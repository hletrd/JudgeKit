# Cycle 45 — Document Specialist

**Date:** 2026-04-23
**Base commit:** d96a984f

## Findings

### DOC-1: `getDbNowUncached` usage is not documented in rate-limiting module [LOW/LOW]

**File:** `src/lib/security/api-rate-limit.ts`

The rate-limiting module uses `Date.now()` for DB-timestamp comparisons, which is inconsistent with the rest of the codebase that uses `getDbNowUncached()`. This inconsistency should be documented as a known trade-off (performance vs. clock-skew precision) so future maintainers understand the decision.

**Fix:** Add a code comment at line 54 explaining the trade-off.

---

### DOC-2: Contest analytics `includeTimeline` parameter is not documented in API docs [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`

The `includeTimeline` query parameter that controls the expensive student-progression query is not documented. Instructors using the API directly may not know about this parameter.

**Fix:** Add JSDoc or API documentation noting the `includeTimeline` parameter.

---

## Summary

| ID | Severity/Confidence | Description |
|----|----|----|
| DOC-1 | LOW/LOW | Rate-limit Date.now() trade-off not documented |
| DOC-2 | LOW/LOW | Analytics includeTimeline parameter not documented |
