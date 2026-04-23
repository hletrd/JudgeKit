# Cycle 28 Architecture Review

**Date:** 2026-04-20
**Reviewer:** architect
**Base commit:** d4489054

## Findings

### ARCH-1: Duplicated visibility-aware polling pattern across 4 components [LOW/LOW]

**Files:**
- `src/components/contest/contest-announcements.tsx:71-95`
- `src/components/contest/contest-clarifications.tsx:87-111`
- `src/components/contest/participant-anti-cheat-timeline.tsx:89-95` (similar, simplified)
- `src/hooks/use-submission-polling.ts:192-291` (different but conceptually similar)

**Problem:** Four components implement their own visibility-aware polling logic. The pattern is: (1) start interval when visible, (2) clear interval when hidden, (3) handle visibilitychange event. This is a DRY violation that increases maintenance burden and the risk of inconsistent behavior.

The `use-submission-polling.ts` version is more sophisticated (SSE fallback, exponential backoff, abort controller) and serves a different use case. The other three are simpler and could share a hook.

**Fix:** Extract a `useVisibilityAwarePolling(callback, intervalMs)` hook. This was noted as DEFER-11 in previous cycles. Reaffirming it as a low-priority maintainability improvement.

### ARCH-2: Workspace-to-public migration — all phases complete, no architectural debt remaining [INFO]

**Status:** The migration plan (Phases 1-5) is fully complete. The `AppSidebar` is hidden for non-admin users, all redundant routes are redirected, and the `PublicHeader` provides unified navigation. The admin sidebar remains necessary for its 14 admin-specific nav items. No further architectural work is needed for this migration.

## Verified Safe / No Issue

- Route group structure is clean: `(public)` for unauthenticated, `(dashboard)` for authenticated, `(auth)` for auth flows. The `(workspace)` and `(control)` groups have been eliminated.
- Navigation is centralized via `lib/navigation/public-nav.ts` — both layouts use the same shared helpers.
- Capability-based filtering is consistent between `PublicHeader` (dropdown items) and `AppSidebar` (sidebar items).
- Proxy middleware properly handles auth, CSP, locale resolution, and cache headers.
- i18n is well-structured with proper locale resolution (explicit query param > cookie > Accept-Language > default).
