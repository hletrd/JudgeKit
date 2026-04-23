# RPF Cycle 16 — Tracer

**Date:** 2026-04-20
**Base commit:** 58da97b7

## Findings

### TR-1: Bulk recruiting invitation past-date flow creates broken invitations [MEDIUM/HIGH]

- **File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:62-68`
- **Description:** Tracing the data flow for a bulk request with `expiryDate: "2020-01-01"`:
  1. Client sends `POST /api/v1/contests/{id}/recruiting-invitations/bulk` with `invitations: [{ expiryDate: "2020-01-01" }]`
  2. Server fetches `dbNow` (2026-04-20)
  3. `expiresAt = new Date("2020-01-01T23:59:59Z")` — this is in the past
  4. Upper-bound check: `(2020-01-01 - 2026-04-20) < MAX_EXPIRY_MS` — passes (negative difference)
  5. Invitation is created with `expiresAt: 2020-01-01T23:59:59Z`
  6. The `isExpired` computed field (in `getRecruitingInvitations`) compares `expiresAt <= dbNow` → true
  7. Invitation appears as "expired" immediately upon creation
  8. The invitation token URL `/recruit/{token}` will show "This invitation has expired"
  
  Hypothesis 1: The bulk route was intended to have the same validation as the single route but was missed during the rpf-15 fix. CONFIRMED by code comparison.
  Hypothesis 2: Past dates are intentionally allowed for some edge case. REJECTED — no documentation or comment suggests this, and the single/PATCH routes explicitly reject it.
- **Fix:** Add the missing `expiryDateInPast` check.
- **Confidence:** HIGH

### TR-2: Clipboard failure in workers-client.tsx produces misleading success toast [LOW/MEDIUM]

- **File:** `src/app/(dashboard)/dashboard/admin/workers/worker-client.tsx:168-171`
- **Description:** Tracing the `copyToClipboard` function:
  1. User clicks "Copy" on a deploy command
  2. `navigator.clipboard.writeText(text)` is called — NOT awaited
  3. `toast.success(t("copied"))` fires immediately (before clipboard resolves)
  4. If clipboard fails (promise rejects), the toast already showed "Copied"
  5. The rejection is unhandled — no error feedback to the user
  
  The function is not async, so the clipboard promise floats without any handling.
- **Fix:** Make function async, await clipboard, wrap in try/catch.
- **Confidence:** HIGH

## Verified Safe

- Recruiting invitation single-create and PATCH routes have complete validation chains (expiryDateInPast + expiryDateTooFar).
- The `isExpired` server-computed field correctly handles all edge cases.
