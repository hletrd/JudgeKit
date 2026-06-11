# RPF Cycle 16 — Critic

**Date:** 2026-04-20
**Base commit:** 58da97b7

## Findings

### CRI-1: Bulk route validation gap — missing expiryDateInPast check [MEDIUM/HIGH]

- **File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:62-68`
- **Description:** The rpf-15 H1 fix added upper-bound validation for `expiryDate` across all three routes (single, PATCH, bulk), and `expiryDateInPast` checks in the single and PATCH routes. The bulk route was missed for the in-past check. This is a code review oversight — the rpf-15 fix was applied consistently for the upper bound but not for the lower bound.
- **Confidence:** HIGH

### CRI-2: Clipboard error handling pattern is fragmented across the codebase [LOW/MEDIUM]

- **Files:** `workers-client.tsx:168-171`, `file-management-client.tsx:90-96`, `recruiting-invitations-panel.tsx:308-312`
- **Description:** The rpf-15 M1 fix added try/catch to `handleCopyLink` in the recruiting invitations panel, but missed three other clipboard call sites in the same component and other components. This suggests the fix was applied narrowly rather than systematically. A shared clipboard utility or hook would prevent future regressions.
- **Confidence:** HIGH

### CRI-3: Copy-feedback timer cleanup pattern is also fragmented [LOW/LOW]

- **Files:** `file-management-client.tsx:95`, `access-code-manager.tsx:48`, `contest-join-client.tsx:60`
- **Description:** The rpf-15 M2 fix added timer tracking with a ref in the recruiting invitations panel, but the same pattern issue exists in other components. `file-management-client.tsx` and `access-code-manager.tsx` both use untracked `setTimeout` for copy feedback. While the risk is low (React 18+ no longer warns for this), it is still a code quality inconsistency.
- **Confidence:** MEDIUM

## Verified Safe

- The workspace-to-public migration has made good incremental progress — the edit button on public problem detail pages is a solid pattern for auth-aware rendering.
- Navigation centralization via `public-nav.ts` is well-designed and extensible.
