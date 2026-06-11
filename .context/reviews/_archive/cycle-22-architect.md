# Architect — Cycle 22 (Fresh)

**Date:** 2026-04-20
**Base commit:** e80d2746

## Findings

### ARCH-1: `formatNumber` re-export in `datetime.ts` creates a split import surface [LOW/MEDIUM]

**File:** `src/lib/datetime.ts:61`
**Description:** `formatNumber` was moved to `formatting.ts` but a re-export remains in `datetime.ts` with a `@deprecated` tag. This creates two import paths for the same function, confusing new developers about which module "owns" number formatting. The deprecation should be completed by updating all imports and removing the re-export.
**Fix:** Update all imports from `@/lib/datetime` to `@/lib/formatting` for `formatNumber`, then remove the re-export.
**Confidence:** HIGH

### ARCH-2: Chat widget plugin modules are not using centralized API client [LOW/MEDIUM]

**Files:** `src/lib/plugins/chat-widget/admin-config.tsx:89-92`, `src/lib/plugins/chat-widget/chat-widget.tsx:154`
**Description:** The chat widget plugin bypasses the centralized `apiFetch` wrapper. This is both a DRY violation and a maintenance risk (same as the cycle-21 AGG-1 finding that was fixed for admin components). Plugin code should follow the same conventions as the rest of the codebase.
**Fix:** Replace raw `fetch()` with `apiFetch()` in both files.
**Confidence:** HIGH

## Verified Safe

- Navigation is centralized via shared `public-nav.ts` module.
- AppSidebar and PublicHeader dropdown items are capability-filtered consistently.
- Workspace-to-public migration is progressing well: `(control)` group fully merged, submissions/compiler removed from sidebar.
- Formatting utilities are consolidated in `src/lib/formatting.ts`.
- `getDbNowUncached()` is used consistently across API routes for temporal consistency.
- `SystemTimezoneProvider` is properly wired in root layout and used by client components that display timestamps.
