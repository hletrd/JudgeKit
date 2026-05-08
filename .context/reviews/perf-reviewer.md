# Performance Reviewer — Cycle 3/100

**Date:** 2026-05-08
**HEAD:** main / c43ec539
**Scope:** Page load times, query patterns, data retention, worker cleanup

---

## CRITICAL

None found this cycle.

---

## HIGH

None found this cycle.

---

## MEDIUM

### P1: Audit logs CSV export fetches 10,000 rows synchronously
- **File:** `src/app/api/v1/admin/audit-logs/route.ts:121-122`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Problem:** CSV export loads up to 10,000 rows into memory and serializes them synchronously. Large exports could block the event loop and consume significant memory.
- **Fix:** Stream CSV generation using a generator or streaming response, or reduce the row limit.

### P2: Data retention uses ctid-based batch delete
- **File:** `src/lib/data-retention-maintenance.ts:28-29`
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **Problem:** `ctid` can change during concurrent operations, causing missed or duplicate deletes.
- **Fix:** Use primary key-based batching.

### P3: 82 stale worker records slow dashboard health queries
- **File:** `src/lib/ops/admin-health.ts:71-77`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Problem:** The health query counts all judge_workers rows. With 82 stale/offline workers, this query runs against a bloated table.
- **Fix:** Clean up stale workers or add an index on status.

---

## LOW

### P4: Contest pages force full navigation workaround
- **File:** `src/app/(public)/contests/manage/layout.tsx`
- **Severity:** LOW
- **Confidence:** HIGH
- **Problem:** Contest pages bypass client-side RSC streaming, causing slower perceived navigation.

---

## FINDINGS COUNT: 4
