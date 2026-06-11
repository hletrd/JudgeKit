# RPF Cycle 16 — Debugger

**Date:** 2026-04-20
**Base commit:** 58da97b7

## Findings

### DBG-1: Bulk recruiting invitations allows past `expiryDate` — creates immediately-expired invitations [MEDIUM/HIGH]

- **File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:62-68`
- **Description:** When `expiryDate` is in the past, the bulk route computes `expiresAt = new Date("2020-01-01T23:59:59Z")` which is less than `dbNow`, but no `expiryDateInPast` check exists. The single-create and PATCH routes both reject this case. The invitation is created in "pending" status but is immediately treated as "expired" by the `isExpired` check (which compares `expiresAt <= dbNow`). This creates a confusing state where the invitation appears in the list but cannot be redeemed.
- **Concrete failure scenario:** Admin bulk-creates 5 invitations with `expiryDate: "2020-01-01"`. All 5 are created successfully (200 response) but are immediately expired. The admin sees them in the "Expired" filter and cannot send them to candidates.
- **Fix:** Add `if (expiresAt <= dbNow) throw new Error("expiryDateInPast");` in the bulk route's `expiryDate` branch.
- **Confidence:** HIGH

### DBG-2: Unhandled clipboard promise rejection in workers-client.tsx [LOW/MEDIUM]

- **File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:169`
- **Description:** `navigator.clipboard.writeText(text)` is called without await or try/catch. The function `copyToClipboard` is not async, so the promise rejection is completely unhandled. The success toast on the next line fires regardless.
- **Fix:** Make the function async, await the clipboard call, and wrap in try/catch.
- **Confidence:** HIGH

### DBG-3: File management clipboard URL copy lacks error handling [LOW/MEDIUM]

- **File:** `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:92`
- **Description:** `await navigator.clipboard.writeText(url)` can throw but is not wrapped in try/catch. If it fails, execution continues to the success toast, misleading the user.
- **Fix:** Wrap in try/catch with error toast.
- **Confidence:** HIGH

## Verified Safe

- No race conditions in recruiting invitation creation (advisory locks properly used).
- Transaction boundaries are correct in all three recruiting invitation routes.
- Clipboard fallback patterns in `api-keys-client.tsx` (document.execCommand) work correctly as last resort.
