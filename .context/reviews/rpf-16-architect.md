# RPF Cycle 16 — Architect

**Date:** 2026-04-20
**Base commit:** 58da97b7

## Findings

### ARCH-1: Inconsistent clipboard error handling across client components [LOW/MEDIUM]

- **Files:** Multiple client components: `workers-client.tsx`, `file-management-client.tsx`, `recruiting-invitations-panel.tsx:310`
- **Description:** The codebase has an inconsistent pattern for clipboard operations. Some components correctly wrap `navigator.clipboard.writeText()` in try/catch with error toasts (`api-keys-client.tsx`, `access-code-manager.tsx`, `recruiting-invitations-panel.tsx` handleCopyLink), while others do not (`workers-client.tsx`, `file-management-client.tsx`, `recruiting-invitations-panel.tsx` created-link button). This is a pattern inconsistency that should be unified.
- **Fix:** Create a shared `copyToClipboard(text, { onSuccess, onError })` utility that all components use, or extract a `useClipboard` hook that handles try/catch, timer tracking, and error toasting consistently.
- **Confidence:** HIGH

### ARCH-2: Workspace-to-public migration Phase 4 — remaining dashboard duplicate pages [MEDIUM/MEDIUM]

- **Files:** `src/app/(dashboard)/dashboard/problems/page.tsx`, `src/app/(dashboard)/dashboard/contests/page.tsx`, `src/app/(dashboard)/dashboard/submissions/page.tsx`
- **Description:** Phase 4 of the workspace-to-public migration plan calls for removing redundant page components under `(dashboard)` where public counterparts exist. The rankings, languages, and compiler routes have been redirected to public counterparts. However, problems, contests, and submissions still have both dashboard and public versions with significant overlap. The dashboard problems page at `/dashboard/problems` includes instructor-specific features (create, edit, delete) while the public practice page at `/practice` is read-only. These could potentially be unified with auth-aware rendering, similar to how the problem detail page now shows an edit button for instructors.
- **Fix:** Incremental: continue Phase 4 by evaluating each remaining dashboard page for auth-aware merging with its public counterpart. Start with submissions (simplest) and contests (moderate complexity).
- **Confidence:** MEDIUM

## Verified Safe

- Navigation is properly centralized via shared `public-nav.ts`.
- Route group structure is clean: `(public)`, `(dashboard)`, `(auth)` — the `(workspace)` and `(control)` groups have been successfully eliminated.
- Capability-based filtering is consistently applied in both `PublicHeader` dropdown and `AppSidebar`.
- Korean letter-spacing is correctly handled with locale checks across all components.
