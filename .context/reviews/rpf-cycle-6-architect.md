# Architect — RPF Cycle 6

## Scope
Architectural review focusing on recently changed files and structural patterns.

## Findings

### ARCH-1: `recruiting-invitations-panel.tsx` — Component exceeds 600 lines, handling too many concerns
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/contest/recruiting-invitations-panel.tsx` (613 lines)
- **Problem:** This component handles: (1) listing invitations with search/filter, (2) creating invitations with dialog, (3) revoking, deleting, and resetting passwords, (4) stats display, (5) link copying, (6) the "created link" dialog. It has 10+ state variables. This makes it hard to test and maintain.
- **Fix:** Extract `CreateInvitationDialog`, `InvitationActionsMenu`, and `InvitationStatsCards` as separate components. This would reduce the state management complexity in each.

### ARCH-2: Inconsistent error handling pattern — `handleCreate` vs `handleRevoke`/`handleDelete`
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/contest/recruiting-invitations-panel.tsx`
- **Problem:** `handleRevoke` (line 229) and `handleDelete` (line 274) both have `try/catch` with error toast. `handleCreate` (line 150) has `try/finally` without `catch`. This inconsistency makes the codebase harder to reason about and violates the apiFetch convention.
- **Fix:** Add `catch` block to `handleCreate` matching the other handlers' pattern.

### ARCH-3: Carried — 11 API routes still use manual `getApiUser` (cycle 5 AGG-6)
- **Severity:** LOW
- **Confidence:** HIGH
- **Status:** NOT FIXED

### ARCH-4: `window.location.origin` used in multiple client components for URL construction
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Problem:** 4 files use `window.location.origin` to build URLs for sharing. This is a cross-cutting concern that should be centralized into a single utility that could eventually be replaced with an environment variable for the canonical origin.
- **Status:** Deferred (DEFER-24)
