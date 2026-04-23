# RPF Cycle 16 — Verifier

**Date:** 2026-04-20
**Base commit:** 58da97b7

## Findings

### VER-1: Bulk recruiting invitations missing expiryDateInPast validation — inconsistent with single and PATCH routes [MEDIUM/HIGH]

- **File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:62-68`
- **Description:** Verification of the rpf-15 H1 fix found that the `expiryDateInPast` check was correctly added to the single-create route (line 78-79) and the PATCH route (line 115-116), but the bulk route was missed. The bulk route has the `expiryDateTooFar` upper-bound check but no lower-bound check. This is a gap in the rpf-15 remediation.
- **Evidence:** Comparing the three routes:
  - Single: `if (expiresAt <= dbNow) throw new Error("expiryDateInPast")` -- PRESENT
  - PATCH: `if (expiresAtUpdate <= dbNow) return apiError("expiryDateInPast", 400)` -- PRESENT
  - Bulk: No equivalent check -- MISSING
- **Fix:** Add the check in the bulk route.
- **Confidence:** HIGH

### VER-2: Clipboard error handling incomplete after rpf-15 M1 fix [LOW/MEDIUM]

- **Files:** `workers-client.tsx:169`, `file-management-client.tsx:92`, `recruiting-invitations-panel.tsx:310`
- **Description:** The rpf-15 M1 fix added try/catch to `handleCopyLink` in the recruiting invitations panel, but verification shows three additional clipboard call sites in the same codebase that lack try/catch. The fix was applied too narrowly.
- **Confidence:** HIGH

## Verified Safe

- RPF-15 H1 (expiryDate upper-bound): Correctly implemented in all three routes (single, PATCH, bulk). Verified the MAX_EXPIRY_MS constant and the comparison logic.
- RPF-15 H2 (consolidate getDbNowUncached): Correctly implemented in the single-create route. dbNow is fetched once before the if/else block.
- RPF-15 M1 (clipboard error handling): Correctly implemented in `handleCopyLink` function. Verified try/catch and error toast.
- RPF-15 M2 (timer cleanup): Correctly implemented with `copiedIdTimer` ref. Verified clearTimeout and useEffect cleanup.
- RPF-15 M3 (timezone hint): Correctly implemented. Verified the hint text renders below the date picker.
- RPF-15 L1 (JSDoc): Correctly implemented. Verified `@param dbNow` is present.
- RPF-15 W1 (edit button on public problem detail): Correctly implemented. Verified the button renders conditionally based on `caps.has("problems.create")`.
- All deferred items (DEFER-1 through DEFER-5) are still valid and correctly recorded.
