# Cycle 25 Designer Review

**Date:** 2026-04-20
**Base commit:** cbae7efd

## Findings

### DES-1: Top-level nav has 7 items — exceeds recommended maximum for desktop nav bars [MEDIUM/HIGH]

**File:** `src/lib/navigation/public-nav.ts:24-33`
**Description:** The public nav returns 7 top-level items: Practice, Playground, Contests, Rankings, Submissions, Community, Languages. UX best practice for horizontal nav bars is 5-7 items max. At 7 items, the nav is at the upper limit and can feel cluttered on medium screens. The user-injected TODO addresses this by moving Languages to a submenu, which is the correct fix.
**Concrete failure scenario:** On a 1024px screen with a long site title, the nav items crowd the header, reducing readability and making touch targets smaller.
**Fix:** Move Languages out of the top-level nav (as per user-injected TODO). This reduces to 6 items, a more comfortable count.

### DES-2: Remaining `tracking-tight` on Korean-reachable headings — inconsistent typography [MEDIUM/MEDIUM]

**Files:** See CR-2 for the full file list.
**Description:** The previous cycle fixed several Korean letter-spacing violations, but many shared components still apply hardcoded `tracking-tight` to headings that render Korean text. This creates an inconsistent experience: some pages respect Korean default spacing, others do not.
**Concrete failure scenario:** A Korean user navigating from the home page (correct spacing) to the community new-thread page (cramped spacing) notices the typography shift.
**Fix:** Apply locale-conditional tracking pattern consistently across all shared heading components.
