# Code Reviewer — Cycle 3/100

**Date:** 2026-05-08
**HEAD:** main / c43ec539
**Scope:** Full repository code review focused on correctness, edge cases, and cross-file interactions

---

## CRITICAL

None found this cycle.

---

## HIGH

### H1: Audit logs API route lacks instructor scope filtering
- **File:** `src/app/api/v1/admin/audit-logs/route.ts:37`
- **Severity:** HIGH
- **Confidence:** HIGH
- **Problem:** The server page `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx` distinguishes between `isAdminViewer` and `isInstructorViewer`, applying scope filters for instructors (only showing audit events for their owned groups, assignments, submissions, and problems). The API route only checks `system.audit_logs` capability with no scope filtering. An instructor with this capability can access ALL audit logs via the CSV export API or direct API calls, bypassing the scope restrictions enforced in the UI.
- **Failure:** Instructor downloads CSV export and sees audit logs for groups/assignments they do not own.
- **Fix:** Add instructor scope filtering to the API route, mirroring the logic in the server page.

### H2: Audit logs dateTo filter inconsistent between UI and API
- **Files:**
  - `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:300-302`
  - `src/app/api/v1/admin/audit-logs/route.ts:82-86`
- **Severity:** HIGH
- **Confidence:** HIGH
- **Problem:** The server page advances `dateTo` to the next day at midnight (`endOfDay.setDate(endOfDay.getDate() + 1)`), while the API route sets it to 23:59:59.999 of the same day (`endOfDay.setHours(23, 59, 59, 999)`). This means the same date range produces different results in the UI table vs the CSV export.
- **Failure:** User filters by date 2026-05-08 in UI, sees events up to 2026-05-09 00:00:00. Downloads CSV for same range, gets events only up to 2026-05-08 23:59:59.999. Events at exactly 2026-05-08 23:59:59.500 appear in UI but not CSV; events at 2026-05-09 00:00:01 appear in UI but not CSV.
- **Fix:** Make both implementations consistent. Use `setHours(23, 59, 59, 999)` in both places.

---

## MEDIUM

### M1: Dashboard health permanently "degraded" due to stale workers in DB
- **File:** `src/lib/ops/admin-health.ts:88-91`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Problem:** `overallStatus` is "degraded" if `stale > 0`. Production shows 42 stale workers and 40 offline workers. There is no cleanup mechanism for workers that have gone permanently offline. The `judge_workers` table accumulates stale/offline entries indefinitely, making the dashboard permanently show "Degraded" even when the system is functionally healthy.
- **Failure:** Operators see "Degraded" health constantly and learn to ignore it, reducing the signal value of the health indicator.
- **Fix:** Either: (a) add a cleanup job that removes workers stale/offline for > N days, or (b) change the degraded threshold to consider the ratio of online vs total active workers, or (c) add a separate "stale worker cleanup" admin action.

### M2: Data retention batchedDelete uses ctid which is not stable
- **File:** `src/lib/data-retention-maintenance.ts:28-29`
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **Problem:** The `batchedDelete` function uses `ctid` (PostgreSQL physical row identifier) for batch selection. `ctid` can change during `VACUUM FULL`, concurrent updates, or page splits. If `ctid` changes between the subquery SELECT and the outer DELETE, rows may be missed or the wrong rows may be deleted.
- **Failure:** During heavy concurrent load or maintenance operations, data retention cleanup may miss rows or delete incorrect rows.
- **Fix:** Use primary key-based batching instead of `ctid`. Each table in the schema has a primary key that can be used for this purpose.

### M3: JSON LIKE pattern in audit logs group member scope filter
- **File:** `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:150`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Problem:** The `buildGroupMemberScopeFilter` function uses a LIKE pattern against JSON blob: `sql`${auditEvents.details} LIKE ${'"groupId":"' + escapeLikePattern(groupId) + '"%'} ESCAPE '\\'``. This assumes the JSON key `groupId` is serialized in exactly this order and format. If the JSON serialization changes (e.g., keys reordered, spaces added), the filter will silently fail to match.
- **Failure:** Instructor audit logs show no group_member events after a JSON serialization change.
- **Fix:** Use PostgreSQL JSON operators (`details->>'groupId'`) or parse JSON in application code.

---

## LOW

### L1: Process uptime displayed instead of system uptime
- **File:** `src/lib/ops/admin-health.ts:6-8`
- **Severity:** LOW
- **Confidence:** HIGH
- **Problem:** `getUptimeSeconds()` returns `process.uptime()` which is the Node.js process uptime, not the system uptime. Users/operators may interpret this as system uptime and be alarmed by short values (e.g., 284s after a process restart).
- **Fix:** Rename to "Process uptime" in the UI, or add system uptime via OS-level query.

### L2: sanitizeHtml allows h1-h6 tags which can break heading hierarchy
- **File:** `src/lib/security/sanitize-html.ts:30-35`
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Problem:** Problem descriptions can contain `h1-h6` tags. When rendered on a problem page, these headings can conflict with the page's own heading hierarchy (the problem title is typically h1, so description h1 creates duplicate h1s).
- **Fix:** Restrict to h3-h6 or lower, or transform headings to appropriate levels during rendering.

---

## FINDINGS COUNT: 7
