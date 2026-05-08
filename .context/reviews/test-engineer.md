# Test Engineer — Cycle 3/100

**Date:** 2026-05-08
**HEAD:** main / c43ec539
**Scope:** Test coverage gaps for cycle 3 findings

---

## MEDIUM

### T1: No tests for audit logs API route scope filtering
- **File:** `src/app/api/v1/admin/audit-logs/route.ts`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Problem:** No tests verify that instructors can only see their scoped audit events via the API. The server page has scope logic but the API route lacks it entirely — no test catches this.
- **Fix:** Add integration tests for the audit-logs API that verify instructor vs admin scope.

### T2: No tests for audit logs date filter consistency
- **Files:**
  - `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx`
  - `src/app/api/v1/admin/audit-logs/route.ts`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Problem:** No tests verify that the UI page and API route produce the same results for identical date filters.
- **Fix:** Add unit tests for the date filter logic in both files, or extract to a shared function.

### T3: No tests for dashboard health snapshot logic
- **File:** `src/lib/ops/admin-health.ts`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Problem:** No tests verify the degraded/ok status logic, especially the stale worker threshold.
- **Fix:** Add unit tests for `getAdminHealthSnapshot` with mocked worker stats.

---

## LOW

### T4: No tests for data retention batchedDelete
- **File:** `src/lib/data-retention-maintenance.ts`
- **Severity:** LOW
- **Confidence:** HIGH
- **Problem:** No tests verify the batched delete logic, including edge cases like empty tables or tables with fewer than BATCH_SIZE rows.
- **Fix:** Add integration tests for batchedDelete.

---

## FINDINGS COUNT: 4
