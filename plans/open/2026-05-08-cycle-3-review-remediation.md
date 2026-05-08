# Cycle 3 Review Remediation Plan

**Date:** 2026-05-08
**Review source:** `.context/reviews/_aggregate.md` (cycle 3/100)
**HEAD:** main / c43ec539
**Goal:** Fix actionable findings from production browser review and code analysis.

---

## Items to implement this cycle

### 1. H1/S1 — Add instructor scope filtering to audit logs API route
- **File:** `src/app/api/v1/admin/audit-logs/route.ts`
- **Task:** Mirror the instructor scope filtering logic from `page.tsx` (lines 201-278) in the API route. When the caller is an instructor (not admin), restrict results to audit events for their owned groups, assignments, submissions, and problems.
- **Status:** DONE — Added `resolveCapabilities` check, instructor scope queries for groups/assignments/submissions/problems, and scoped filter application.

### 2. H2 — Fix audit logs dateTo filter inconsistency between UI and API
- **Files:**
  - `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx` (lines 289-303)
  - `src/app/api/v1/admin/audit-logs/route.ts` (lines 82-86)
- **Task:** Extract a shared `buildAuditLogDateToFilter` function (or use consistent logic) so both the server page and API route produce identical date ranges. Use `setHours(23, 59, 59, 999)` approach (end of same day) in both places.
- **Status:** DONE — Changed page.tsx from `setDate(getDate() + 1)` to `setHours(23, 59, 59, 999)` to match API route.

### 3. S2 — Add rate limiting to audit logs CSV export
- **File:** `src/app/api/v1/admin/audit-logs/route.ts`
- **Task:** Apply the existing rate limiting infrastructure (`consumeRateLimitAttemptMulti`) to the CSV export endpoint. Use a dedicated rate limit key (e.g., `audit-logs-export`) with reasonable thresholds.
- **Status:** DONE — Added `rateLimit: "audit-logs:export"` to `createApiHandler` config.

### 4. M3/C3 — Replace JSON LIKE pattern with jsonb operator in audit logs
- **File:** `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx` (line 150)
- **Task:** Replace the fragile `LIKE '%"groupId":"' + groupId + '"%'` pattern with PostgreSQL jsonb operator: `details->>'groupId' = groupId`. Verify the `details` column is jsonb type.
- **Status:** DONE — Replaced LIKE pattern with `(${auditEvents.details}::jsonb)->>'groupId' = ${groupId}` in both page.tsx and API route. Verified `details` stores JSON strings produced by `JSON.stringify()`, so the cast is safe.

### 5. M2 — Fix data retention batchedDelete to use primary keys instead of ctid
- **File:** `src/lib/data-retention-maintenance.ts` (lines 21-38)
- **Task:** Refactor `batchedDelete` to use primary key-based batching instead of `ctid`. Each target table has a primary key that can be used for `DELETE ... WHERE id IN (SELECT id FROM ... LIMIT BATCH_SIZE)`.
- **Status:** DONE — Changed `ctid` to `${table.id}` in both DELETE and subquery. All target tables have `id` as primary key (text type with nanoid default).

---

## Deferred items (must record exit criteria)

| ID | Severity | File/Line | Reason for deferral | Exit criterion |
|---|---|---|---|---|
| M1 | MEDIUM | `src/lib/ops/admin-health.ts:88-91` | Stale worker "degraded" status is operational/UX issue, not security or correctness. The system functions correctly; the indicator is overly sensitive. | Re-open when implementing automatic stale worker cleanup or health threshold tuning |
| D2 | MEDIUM | `src/lib/ops/admin-health.ts:6-8` | Process uptime label is UX clarity issue, not a bug. The value is technically correct. | Re-open when dashboard UI is refreshed with "Process uptime" label |
| P1 | MEDIUM | `src/app/api/v1/admin/audit-logs/route.ts:121` | CSV sync loading is performance optimization, not correctness. 10k row limit bounds the issue. | Re-open when implementing streaming CSV export |
| S3 | MEDIUM | `src/app/api/v1/admin/login-logs/route.ts` | Login logs scope needs product decision on whether instructors should have restricted view. Not a confirmed bug. | Re-open when access control policy for login logs is clarified |
| D4 | LOW | `src/app/(public)/contests/manage/layout.tsx` | Next.js upstream workaround. Not our code bug. | Re-open when upstream Next.js fixes RSC streaming with proxy headers |
| D5 | LOW | `/dashboard/admin/workers` | Stale worker clutter is operational data cleanup. | Re-open when implementing automatic worker pruning |
| L2 | LOW | `src/lib/security/sanitize-html.ts:30-35` | Heading hierarchy is accessibility best practice, not a functional bug. | Re-open when doing accessibility audit |
| T1-T4 | LOW-MEDIUM | Various | Test coverage gaps are best-effort improvements. | Re-open when expanding test suite |
| S4 | LOW | `src/app/api/v1/admin/chat-logs/route.ts` | Chat logs scope not reviewed in detail this cycle. | Re-open when reviewing chat logs module |

---

## Implementation order

1. H2 (dateTo inconsistency) — correctness bug affecting data consistency
2. H1/S1 (API scope filtering) — security/authz bug
3. M3/C3 (JSON LIKE) — fragile correctness pattern
4. S2 (CSV rate limiting) — security hardening
5. M2 (ctid batch delete) — correctness fix for data retention
