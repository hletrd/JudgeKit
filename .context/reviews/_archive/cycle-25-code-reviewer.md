# Cycle 25 Code Reviewer

**Date:** 2026-04-20
**Base commit:** cbae7efd

## Findings

### CR-1: Hardcoded English string "Solved" in public-problem-set-detail.tsx [MEDIUM/HIGH]

**File:** `src/components/problem/public-problem-set-detail.tsx:81`
**Description:** The component renders a Badge with hardcoded English text `>Solved<`. This app supports Korean locale (ko), but this string is not internationalized via i18n. When the locale is Korean, users will see "Solved" instead of the Korean equivalent.
**Concrete failure scenario:** Korean users viewing problem sets see "Solved" in English rather than the localized string.
**Fix:** Pass a `solvedLabel` prop (from i18n) and use it instead of the hardcoded string.

### CR-2: Multiple components still apply hardcoded `tracking-tight` to Korean-reachable headings [MEDIUM/MEDIUM]

**Files:**
- `src/app/(public)/community/new/page.tsx:19` — `tracking-tight` on `{t("community.newThreadTitle")}`
- `src/components/problem/public-problem-set-detail.tsx:49` — `tracking-tight` on `{title}`
- `src/app/(public)/rankings/page.tsx:217` — `tracking-tight` on `{t("title")}`
- `src/app/(public)/users/[id]/page.tsx:215` — `tracking-tight` on `{user.name}`
- `src/components/problem/public-problem-set-list.tsx:33` — `tracking-tight` on `{title}`
- `src/app/(public)/_components/public-preview-page.tsx:14` — `tracking-tight` on `{title}`
- `src/app/(public)/_components/public-problem-list.tsx:96` — `tracking-tight` on `{title}`
- `src/app/(public)/submissions/page.tsx:123,275` — `tracking-tight` on i18n headings
- `src/components/discussions/discussion-thread-list.tsx:48` — `tracking-tight` on `{title}`
- `src/components/discussions/my-discussions-list.tsx:26` — `tracking-tight` on `{title}`
- `src/components/discussions/discussion-thread-view.tsx:41` — `tracking-tight` on `{repliesTitle}`
- `src/components/discussions/discussion-moderation-list.tsx:39` — `tracking-tight` on `{title}`
- `src/components/user/user-stats-dashboard.tsx:58` — `tracking-tight` on `{title}`

**Description:** Per CLAUDE.md, Korean text must use browser/font default letter-spacing. The previous cycle (24) fixed several components, but many still apply hardcoded `tracking-tight` to headings that may render Korean text. These are shared components used in both locales.
**Concrete failure scenario:** Korean users see cramped letter-spacing on page headings across community, rankings, problem sets, discussions, user profile, and submissions pages.
**Fix:** Apply the locale-conditional pattern (`locale !== "ko" ? " tracking-tight" : ""`) to all affected locations. For client components, use `useLocale()`; for server components, use `getLocale()`.

### CR-3: `/languages` route missing from SEO route matrix and sitemap [LOW/MEDIUM]

**File:** `src/lib/public-route-seo.ts`
**Description:** The `/languages` page is a public, indexable page (visible in the top nav), but it is not listed in `SEO_ROUTE_MATRIX` or `INDEXABLE_PUBLIC_ROUTE_PREFIXES`. This means it is not included in the sitemap and search engines get no structured SEO hints for it. This is a gap if Languages is meant to be a discoverable public page.
**Concrete failure scenario:** The `/languages` page is absent from sitemap.xml, reducing its discoverability by search engines.
**Fix:** Add `/languages` to `INDEXABLE_PUBLIC_ROUTE_PREFIXES` and `SEO_ROUTE_MATRIX` with appropriate SEO settings. Note: this finding becomes moot if the user-injected TODO moves Languages out of the top nav (which may reduce its SEO priority), but it should still be indexed as a reachable public page.
