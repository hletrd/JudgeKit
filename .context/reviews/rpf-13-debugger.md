# RPF Cycle 13 — Debugger

**Date:** 2026-04-20
**Reviewer:** debugger

---

## DBG-1: Backup filename mismatch between server and client [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:52`
**Problem:** The server generates a backup filename using DB time (e.g., `judgekit-backup-2026-04-20T12-00-00-000Z.zip`) and sets it in the `Content-Disposition` header. However, the client-side code generates its own filename using `new Date()` and ignores the server-provided filename. If the browser clock is 5 seconds off, the downloaded file will have a different timestamp than the snapshot inside. During disaster recovery, an operator comparing the filename timestamp with the `exportedAt` field inside the JSON could be confused by the mismatch.
**Concrete failure scenario:** Server snapshot at DB time 12:00:00, but file downloaded as `judgekit-backup-2026-04-20T11-59-55-000Z.zip`. Operator sees 5-second discrepancy in audit trail.
**Fix:** Extract the filename from the `Content-Disposition` response header using `response.headers.get('Content-Disposition')`.
**Confidence:** MEDIUM

## DBG-2: Client-side expired badge could mask server-side expiry during race [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:248`
**Problem:** If an invitation expires between the time the page was loaded and when the user views it, the client-side badge may still show "Pending" because it was computed at render time with a stale browser clock. This is a minor UX issue, not a bug — the server correctly rejects expired tokens on redeem.
**Fix:** Consider polling for status updates or using server-sent events for time-sensitive statuses. Low priority.
**Confidence:** LOW

## Verified Safe

- Recruiting token transaction: atomic SQL claim with `NOW()` prevents TOCTOU.
- All 8 `new Date()` in the transaction path have been replaced with `dbNow`.
- Export backup: SHA-256 integrity checks protect against data corruption.
- Audit buffer flush: re-buffers lost events with cap at 2x threshold — prevents unbounded growth.
