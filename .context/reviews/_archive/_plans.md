# Implementation Plans — Cycle 15

**Date:** 2026-05-12
**Source:** `_aggregate.md` (Cycle 15 review)

---

## Plan C15-1: Fix `setHours` → `setUTCHours` in admin Server Component pages

**Severity:** MEDIUM | **Confidence:** High
**Files:**
- `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx`
- `src/app/(dashboard)/dashboard/admin/login-logs/page.tsx`
- `src/app/(dashboard)/dashboard/admin/submissions/page.tsx`

### Problem
Three admin Server Component pages construct end-of-day timestamps for `dateTo` filters using `setHours(23, 59, 59, 999)`. This sets local time hours, not UTC hours. When the server runs in a non-UTC timezone (e.g., UTC+9), PostgreSQL timestamp comparisons include or exclude wrong records at the day boundary.

The corresponding API routes were fixed in cycle 14, but the Server Component pages that also run direct DB queries were missed.

### Implementation

1. **audit-logs/page.tsx:299**
   - Change `endOfDay.setHours(23, 59, 59, 999);` to `endOfDay.setUTCHours(23, 59, 59, 999);`

2. **login-logs/page.tsx:201**
   - Change `endOfDay.setHours(23, 59, 59, 999);` to `endOfDay.setUTCHours(23, 59, 59, 999);`

3. **submissions/page.tsx:131**
   - Change `endOfDay.setHours(23, 59, 59, 999);` to `endOfDay.setUTCHours(23, 59, 59, 999);`

### Tests
- No new tests needed — pattern fix matching existing convention (API routes already fixed).

---

## Plan C15-2: Add sanitized export guard to `/api/v1/admin/migrate/import`

**Severity:** MEDIUM | **Confidence:** High
**File:** `src/app/api/v1/admin/migrate/import/route.ts`

### Problem
The `/api/v1/admin/restore` route rejects sanitized exports before importing (to prevent nullifying password hashes and other sensitive data). The `/api/v1/admin/migrate/import` route performs the same import flow but lacks this guard.

### Implementation

1. **Import `isSanitizedExport`**
   - Add `isSanitizedExport` to the existing import from `@/lib/db/export`

2. **Add sanitized export check**
   - After `validateExport(data)` returns empty errors (around line 88-91 in multipart path), add:
     ```typescript
     if (isSanitizedExport(data)) {
       return NextResponse.json({ error: "sanitizedExportNotRestorable" }, { status: 400 });
     }
     ```
   - Also add the same check in the JSON body path after `validateExport(data)` (around line where the data is parsed)

3. **Verify error string matches restore route**
   - Use `"sanitizedExportNotRestorable"` to match the restore route's error key

### Tests
- No new tests needed — defensive check matching existing restore route behavior.

---

## Implementation Order

1. C15-1 (three one-line fixes)
2. C15-2 (single file, two insertion points)
