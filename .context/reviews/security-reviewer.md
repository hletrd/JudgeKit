# Security Reviewer — Cycle 3/100

**Date:** 2026-05-08
**HEAD:** main / c43ec539
**Scope:** Auth/authz, data exposure, injection risks, OWASP Top 10

---

## CRITICAL

None found this cycle.

---

## HIGH

### S1: Audit logs API bypasses instructor scope restrictions
- **File:** `src/app/api/v1/admin/audit-logs/route.ts:37-183`
- **Severity:** HIGH
- **Confidence:** HIGH
- **Problem:** The server-side page `page.tsx` distinguishes between `isAdminViewer` and `isInstructorViewer`, applying scope filters for instructors. The API route only checks `system.audit_logs` capability with NO scope filtering. Any user with this capability (including instructors) can call the API directly to access ALL audit events.
- **Attack:** Instructor downloads CSV export containing audit events for all users, groups, and assignments they do not own.
- **Fix:** Add the same instructor scope filtering logic from `page.tsx` to the API route.

### S2: Audit logs CSV export lacks rate limiting
- **File:** `src/app/api/v1/admin/audit-logs/route.ts:121-122`
- **Severity:** HIGH
- **Confidence:** MEDIUM
- **Problem:** The CSV export fetches up to 10,000 rows with no rate limiting. An authorized user could repeatedly hit this endpoint to cause memory exhaustion or DB load spikes.
- **Attack:** Automated script repeatedly calls CSV export, causing memory pressure.
- **Fix:** Apply rate limiting to the CSV export endpoint.

---

## MEDIUM

### S3: Login-logs API exposes all login events without scope filtering
- **File:** `src/app/api/v1/admin/login-logs/route.ts:24-134`
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **Problem:** The login-logs API exposes all login events to anyone with `system.login_logs` capability. Verify if scope restrictions should apply.
- **Fix:** Review and apply consistent scope restrictions.

---

## LOW

### S4: Chat logs API scope not verified
- **File:** `src/app/api/v1/admin/chat-logs/route.ts`
- **Severity:** LOW
- **Confidence:** LOW
- **Problem:** Not reviewed in detail this cycle. Should verify scope filtering.

---

## FINDINGS COUNT: 4
