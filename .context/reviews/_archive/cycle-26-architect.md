# Cycle 26 Architect Review

**Date:** 2026-04-20
**Base commit:** 660ae372

---

## ARCH-1: Duplicate DB query in recruit page — missing server-side data deduplication layer [MEDIUM/MEDIUM]

**Files:** `src/app/(auth)/recruit/[token]/page.tsx:19,56`
**Description:** The recruit page performs the same `getRecruitingInvitationByToken(token)` query in both `generateMetadata` and the page component. In Next.js App Router, these run in the same server render context, but unlike `fetch()` (which React automatically deduplicates via its cache), custom Drizzle queries have no such caching. This is a systemic pattern that could affect other pages with both `generateMetadata` and page-level data fetching.
**Concrete failure scenario:** Under recruiting campaign load, doubled DB queries for invitation lookups waste connection pool resources and add latency.
**Fix:** Introduce a `React.cache()` wrapper for frequently-used DB query functions that are called in both metadata and render paths. This aligns with Next.js's recommended pattern for server component data deduplication.

## ARCH-2: Public nav structure is well-centralized after recent refactors [VERIFIED GOOD]

**Description:** The `getPublicNavItems()` and `getDropdownItems()` functions in `src/lib/navigation/public-nav.ts` properly centralize navigation configuration. The recent refactor to move "Languages" from top-level nav to footer was clean and the dropdown item definitions with capability-based filtering are well-designed.

## ARCH-3: SEO route matrix and robots.txt are properly maintained [VERIFIED GOOD]

**Description:** `src/lib/public-route-seo.ts` and `src/app/robots.ts` are properly synchronized after the recent `/languages` addition and `/workspace` cleanup. The `ROBOTS_DISALLOWED_PATHS` array matches the `robots.ts` disallow list exactly.
