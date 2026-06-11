# Cycle 25 Verifier Review

**Date:** 2026-04-20
**Base commit:** cbae7efd

## Findings

### V-1: Hardcoded "Solved" string — verified not internationalized [MEDIUM/HIGH]

**File:** `src/components/problem/public-problem-set-detail.tsx:81`
**Evidence:** The Badge renders `>Solved<` as a literal string. No i18n key is passed for this text. All other text in the component (title, description, labels) is correctly passed via props from i18n. This is a confirmed defect.
**Fix:** Add a `solvedLabel` prop and wire it through from the calling page.

### V-2: 13 components still have non-locale-conditional `tracking-tight` on Korean-reachable headings — verified [MEDIUM/MEDIUM]

**Evidence:** Grep for `tracking-tight` across all `.tsx` files in `src/` shows 13 component locations where `tracking-tight` is hardcoded without locale-conditional logic. These components render text from i18n (Korean-reachable) or user-generated content (Korean-reachable). The cycle 24 M3 fix only addressed 7 specific files cited in that cycle's review; the remaining 13 were not in the review scope.
**Fix:** Apply locale-conditional tracking pattern to all 13 remaining locations.

### V-3: `/languages` route missing from SEO matrix — verified [LOW/MEDIUM]

**File:** `src/lib/public-route-seo.ts`
**Evidence:** The `SEO_ROUTE_MATRIX` array contains routes for `/`, `/practice`, `/contests`, `/community`, `/playground`, `/rankings`, `/submissions`, `/signup`, `/login`, `/community/new` — but not `/languages`. The `INDEXABLE_PUBLIC_ROUTE_PREFIXES` array also omits `/languages`. The route exists as a public page (`src/app/(public)/languages/page.tsx`) with proper `generateMetadata()`, but is excluded from sitemap generation.
**Fix:** Add `/languages` to the SEO route matrix and indexable prefixes.
