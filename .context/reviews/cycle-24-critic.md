# Critic — Cycle 24

**Date:** 2026-04-20
**Base commit:** f1b478bc

## Findings

### CRI-1: Systematic silent error swallowing across multiple components [MEDIUM/HIGH]

**Files:**
- `src/components/lecture/submission-overview.tsx:101-102`
- `src/components/contest/invite-participants.tsx:49-50`
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:223-224`
- `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:61-62,75-76`
- `src/components/contest/participant-anti-cheat-timeline.tsx:121`

**Description:** There is a systematic pattern of `catch { // ignore }` blocks across the codebase that violates the project's own convention documented in `src/lib/api/client.ts`: "Never silently swallow errors — always surface them to the user." Cycle 23 fixed two instances (`contest-quick-stats.tsx` and `contest-clarifications.tsx`), but at least five more remain. This is a code quality and UX consistency issue: some components surface errors while identically-structured components do not.
**Concrete failure scenario:** Users (instructors, admins) encounter API failures and see stale or empty data with no indication that something went wrong. They waste time troubleshooting their own actions instead of knowing the system is having issues.
**Fix:** Systematically replace all `catch { // ignore }` blocks with toast.error feedback or at minimum a console.warn. Establish a lint rule or code review checklist to prevent new instances.
**Confidence:** HIGH

### CRI-2: Dead code in AppSidebar nav item definition [LOW/HIGH]

**Files:** `src/components/layout/app-sidebar.tsx:66-67`
**Description:** The `titleKeyByMode: { recruiting: "challenges" }` on the Problems nav item is dead code because `hiddenInModes: ["recruiting"]` hides the item entirely in recruiting mode. The title override can never take effect.
**Concrete failure scenario:** Maintainer reads the code and incorrectly believes the Problems nav item appears as "Challenges" in recruiting mode.
**Fix:** Remove the dead `titleKeyByMode` property.
**Confidence:** HIGH

### CRI-3: `ContestsLayout` click interception is a fragile workaround [MEDIUM/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/contests/layout.tsx`
**Description:** The layout intercepts all `<a>` clicks on contest pages and forces `window.location.href` navigation as a workaround for a Next.js 16 RSC streaming bug. This is fragile because:
1. It depends on DOM element IDs (`main-content`) and data attributes (`data-slot='sidebar'`) that could be renamed.
2. It breaks all client-side navigation within contest pages.
3. It uses `stopPropagation()` which interferes with other click handlers.
4. There is no issue tracker link or version pin in the comment, making it hard to know when the workaround can be removed.
**Fix:** Add a Next.js GitHub issue link to the comment. Consider using a data attribute on links that need forced navigation instead of intercepting all links.
**Confidence:** MEDIUM
