# Architect — Cycle 24

**Date:** 2026-04-20
**Base commit:** f1b478bc

## Findings

### ARCH-1: `ContestsLayout` click interception couples layout to Next.js internal behavior [MEDIUM/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/contests/layout.tsx`
**Description:** The contests layout has a global click interceptor that forces `window.location.href` navigation for all internal links. This is a tight coupling to a Next.js 16 RSC streaming bug, but it has architectural implications:
1. It creates a "navigation ghetto" where contest pages have fundamentally different navigation behavior than all other pages.
2. Any component rendered within the contests layout must be aware that client-side navigation is disabled.
3. The workaround has no expiration date or tracking issue, making it likely to persist long after the underlying bug is fixed.
**Fix:** Add a Next.js issue tracker reference. Create a shared utility function (e.g., `forceFullPageNavigation()`) instead of inline DOM manipulation. Consider scoping the interception to only `<Link>` components by checking `data-nesneu-link` or similar attribute.
**Confidence:** MEDIUM

### ARCH-2: AppSidebar "Problems" nav item group has empty labelKey [LOW/LOW]

**Files:** `src/components/layout/app-sidebar.tsx:60`
**Description:** After the "Learning" group label was removed in cycle 23 (because it only had one item), the group now has `labelKey: ""`. While functionally correct (no label renders), this is a code smell — the group wrapper serves no purpose when it has no label and only one item. The item could be promoted to the top level.
**Fix:** Consider flattening the single-item group into the parent structure, or add a comment explaining why the group wrapper is retained (future items may be added).
**Confidence:** LOW

### ARCH-3: Inconsistent error handling patterns across fetch-using components [MEDIUM/MEDIUM]

**Files:** Multiple (see CRI-1)
**Description:** The codebase has no centralized error handling convention for client-side `apiFetch` calls. Some components show toast errors (contest-quick-stats, contest-clarifications), some silently swallow (submission-overview, invite-participants, chat-logs-client), and some set an error state flag (participant-anti-cheat-timeline). This architectural inconsistency makes it hard for developers to know what pattern to follow and leads to the systematic silent-swallowing issue (CRI-1).
**Fix:** Create a shared `useApiFetch` hook or wrapper that standardizes error handling. At minimum, add a coding convention document specifying the expected pattern for different contexts (admin tools vs. student-facing vs. background polling).
**Confidence:** MEDIUM
