# Cycle 25 Architect Review

**Date:** 2026-04-20
**Base commit:** cbae7efd

## Findings

### ARCH-1: `/languages` public page not in SEO route matrix — architectural gap [LOW/MEDIUM]

**File:** `src/lib/public-route-seo.ts`
**Description:** The `/languages` route is a public page (linked from top nav and home page judge info section) but is absent from `SEO_ROUTE_MATRIX` and `INDEXABLE_PUBLIC_ROUTE_PREFIXES`. This is an architectural gap: every public page should have an explicit SEO classification. If Languages is moved to secondary navigation per the user-injected TODO, it still needs SEO classification (it remains a reachable public page).
**Concrete failure scenario:** The `/languages` page is silently excluded from sitemap generation and search engine indexing hints.
**Fix:** Add `/languages` to the SEO route matrix with `indexable: true, localized: true, includedInSitemap: true`.

### ARCH-2: Locale-conditional tracking pattern is inconsistent across the codebase [LOW/MEDIUM]

**Description:** The codebase has two patterns for locale-conditional tracking:
1. Computed variable: `const headingTracking = locale !== "ko" ? " tracking-tight" : ""` then `className={...${headingTracking}}`
2. Inline: `className={...${locale !== "ko" ? " tracking-tight" : ""}}`

Both work, but the inconsistency makes it harder to audit. More importantly, many components still hardcode `tracking-tight` without any locale condition (see CR-2 for full list).
**Fix:** Systematically apply the computed-variable pattern to all shared components with Korean-reachable text. Consider a shared utility like `getLocaleTracking(locale, style)` to reduce boilerplate.
