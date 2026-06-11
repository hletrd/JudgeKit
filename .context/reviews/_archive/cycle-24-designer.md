# Designer — Cycle 24

**Date:** 2026-04-20
**Base commit:** f1b478bc

## Findings

### DES-1: Missing error feedback creates confusing UX in multiple components [MEDIUM/MEDIUM]

**Files:**
- `src/components/lecture/submission-overview.tsx:101-102` — no error feedback on stats fetch failure
- `src/components/contest/invite-participants.tsx:49-50` — no error feedback on search failure
- `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:61-62` — no error feedback on logs fetch failure

**Description:** When API calls fail, these components silently show stale or empty data. From a UX perspective, this violates the principle of visibility: the system should always make its state visible to the user. Other components in the same feature area (contest-quick-stats, contest-clarifications) correctly show toast errors. The inconsistency creates an unpredictable user experience.
**Concrete failure scenario:** An instructor searches for a student to invite. The search fails. They see "No results" and spend time trying different search terms, not knowing the search itself failed.
**Fix:** Show toast error messages on API failure, consistent with the pattern in other components.
**Confidence:** MEDIUM

### DES-2: `ContestsLayout` breaks browser back/forward cache [LOW/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/contests/layout.tsx:27`
**Description:** Using `window.location.href = href` for navigation breaks the browser's bfcache (back/forward cache). When the user presses the back button, the previous page must be fully re-fetched instead of being restored from cache. This is noticeable on contest pages because navigation between sub-pages is common.
**Concrete failure scenario:** An instructor clicks from contest list to contest detail. Pressing back requires a full page reload instead of instant restoration.
**Fix:** This is a consequence of the Next.js workaround. No immediate fix, but worth documenting the UX impact.
**Confidence:** MEDIUM

## Verified Good UX

- Korean letter-spacing is correctly locale-conditional across all components.
- Mobile navigation has proper focus trap and Escape key handling in PublicHeader.
- Skip-to-content link is present on dashboard pages.
- Active nav state is clearly indicated in both PublicHeader and AppSidebar.
- Sign-out button has loading state with spinner.
