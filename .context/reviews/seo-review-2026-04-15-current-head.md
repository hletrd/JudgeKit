# SEO Review — JudgeKit

**Date:** 2026-04-15  
**Scope:** Public crawlable surfaces, locale delivery, metadata helpers, social previews, structured data, `robots.txt`, and `sitemap.xml`  
**Commit reviewed:** `03011b0` (`main`)  
**Primary files inspected:** `src/lib/seo.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/robots.ts`, `src/app/sitemap.ts`, `src/i18n/request.ts`, `src/proxy.ts`, `src/components/layout/locale-switcher.tsx`, `src/app/(public)/**`

---

## Executive Summary

**Overall assessment: SOLID FOUNDATION, BUT NOT YET SEO-HARDENED FOR SCALE OR MULTI-LOCALE INDEXING**

The codebase already has several good SEO building blocks:
- centralized public metadata generation (`src/lib/seo.ts:146-197`)
- explicit `robots.txt` and `sitemap.xml` routes (`src/app/robots.ts:16-27`, `src/app/sitemap.ts:10-57`)
- localized Open Graph fields and generated OG images (`src/lib/seo.ts:121-197`, `src/app/og/route.tsx:15-105`)
- JSON-LD on most important public pages (`src/app/page.tsx:57-71`, `src/app/(public)/practice/page.tsx:120-137`, `src/app/(public)/contests/[id]/page.tsx:68-83`, etc.)
- noindex coverage for major private shells (`src/app/(auth)/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/(workspace)/layout.tsx`, `src/app/(control)/layout.tsx`)

However, the current implementation still has **structural SEO weaknesses** in four areas:
1. **Locale SEO is not URL-stable enough** — locale selection still depends heavily on cookies and `Accept-Language`, while alternates use a query-param model (`?locale=ko`).
2. **Some private/personal pages remain indexable** — especially public-facing submissions routes.
3. **Sitemap/canonical coverage is incomplete** — paginated pages, locale variants, and some public pages are not represented correctly.
4. **Social previews are good, but not yet complete** — fallback/global metadata is weaker than page-level metadata, and route-specific preview enrichment is thin.

If the goal is “overall website SEO,” the highest-value next step is **not** sprinkling more meta tags. It is **making locale URLs deterministic, cleaning indexability boundaries, and aligning sitemap/canonical behavior with the actual rendered page variants**.

---

## What Is Already Good

### 1. Public metadata is centralized instead of duplicated
`buildPublicMetadata()` in `src/lib/seo.ts:146-197` already standardizes:
- canonical URL generation
- alternate language links
- Open Graph
- Twitter card data
- per-page social image URLs

That is the right architectural shape.

### 2. Public detail pages already use structured data
Important public surfaces already emit JSON-LD:
- homepage WebSite: `src/app/page.tsx:57-71`
- practice catalog CollectionPage + ItemList: `src/app/(public)/practice/page.tsx:120-137`
- problem detail TechArticle: `src/app/(public)/practice/problems/[id]/page.tsx:81-94`
- contest catalog CollectionPage + ItemList: `src/app/(public)/contests/page.tsx:57-70`
- contest detail Event: `src/app/(public)/contests/[id]/page.tsx:68-83`
- community list/thread schemas: `src/app/(public)/community/page.tsx:45-62`, `src/app/(public)/community/threads/[id]/page.tsx:76-92`
- playground WebApplication: `src/app/(public)/playground/page.tsx:42-56`

### 3. Social preview generation exists and is reusable
The OG image endpoint is already in place: `src/app/og/route.tsx:15-105`. That is materially better than shipping text-only OG/Twitter metadata.

### 4. Private shells are mostly noindexed
Major private layouts already export `NO_INDEX_METADATA`, which is correct for dashboards, auth flows, workspace surfaces, and control surfaces.

---

## Findings

## HIGH 1 — Locale SEO is still header/cookie-driven rather than URL-first
**Evidence:**
- locale resolution falls back to cookie and `Accept-Language`: `src/i18n/request.ts:10-37`
- response language also depends on request cookie/header state: `src/proxy.ts:90-101`, `src/proxy.ts:144-153`
- locale alternates are query-param based: `src/lib/seo.ts:41-55`, `src/lib/seo.ts:109-119`
- locale switching is a client-side cookie + `router.replace()` action, not a crawlable static locale-link system: `src/components/layout/locale-switcher.tsx:23-35`

**Why this matters:**
Search engines index URLs, not user preference state. Right now, the locale system can serve different language variants for the same pathname depending on cookies or headers, while canonical URLs try to point to query-param alternates. That is better than having no locale signals, but it is still fragile for discovery, cache consistency, and hreflang trust.

**Risk:**
- Korean pages may be under-discovered or inconsistently indexed.
- Crawlers may see one locale at `/practice` while the canonical points to `/practice?locale=ko`.
- Locale QA becomes difficult because content variation is partly invisible in the URL.

**Recommendation:**
Move toward **URL-deterministic locale delivery** for public pages. Preferred: locale-prefixed public routes (`/ko/...`). Minimum acceptable fallback: force every non-default locale page to render only from a distinct crawlable URL and stop relying on cookie/header-selected content for indexable pages.

---

## HIGH 2 — Personal submissions routes are still SEO-visible when they should be fully non-indexable
**Evidence:**
- `/submissions` is an authenticated/personal page, but it generates indexable public metadata: `src/app/(public)/submissions/page.tsx:57-75`
- the page contents are user-specific and gated by session state: `src/app/(public)/submissions/page.tsx:82-107`
- `/submissions/[id]` is also user-specific, but has no `generateMetadata()` noindex handling at all: `src/app/(public)/submissions/[id]/page.tsx:1-120`
- `robots.txt` does not disallow `/submissions`: `src/app/robots.ts:4-27`

**Why this matters:**
These pages are not marketing/public discovery surfaces. They are account surfaces. They should behave like dashboard pages from an SEO standpoint.

**Risk:**
- unnecessary crawl budget consumption
- indexable login walls / thin authenticated shells
- accidental indexing of per-user submission URLs if linked or leaked

**Recommendation:**
Treat `/submissions` and `/submissions/[id]` the same way as private shells:
- `noindex, nofollow`
- add `/submissions` to `robots.txt` disallow list
- ensure canonical points nowhere public (or avoid page-level SEO metadata entirely)

---

## HIGH 3 — Canonical strategy does not account for pagination or search variants
**Evidence:**
- practice metadata ignores `searchParams` and always canonicalizes to `/practice`: `src/app/(public)/practice/page.tsx:21-45`
- rankings metadata ignores `searchParams` and always canonicalizes to `/rankings`: `src/app/(public)/rankings/page.tsx:23-40`
- submissions metadata ignores `page` and `search` params entirely: `src/app/(public)/submissions/page.tsx:57-75`

**Why this matters:**
Page 2, page 3, and filtered states are materially different documents, but they currently inherit page-1 metadata/canonical assumptions. That creates duplicate-title/canonical conflicts and weakens internal pagination signals.

**Risk:**
- page 2+ may canonicalize to page 1 unintentionally
- search-result pages may be indexed as duplicates of the root collection
- social previews for paginated pages are inaccurate

**Recommendation:**
Make a deliberate per-route decision:
- collection pagination pages: canonicalize to the concrete page URL (`?page=2`) if they should index, or to page 1 if they should consolidate
- search/filter pages: usually `noindex, follow`
- add prev/next awareness in structured pagination controls if retained

---

## MEDIUM 1 — Sitemap coverage is incomplete, capped, and not locale-aware
**Evidence:**
- sitemap only emits default URLs and not locale alternates: `src/app/sitemap.ts:32-56`
- sitemap includes only 500 problems, 500 contests, and 200 threads: `src/app/sitemap.ts:11-29`
- sitemap omits some public pages such as `/rankings`: `src/app/sitemap.ts:32-37`

**Why this matters:**
A sitemap is a discovery aid. Hard caps with no pagination/indexing strategy mean discoverability degrades as content grows. Also, if Korean URLs are meant to be indexable, they need a sitemap strategy too.

**Risk:**
- older content falls out of sitemap as content volume grows
- non-default locale URLs rely entirely on hreflang and internal linking
- some public pages are simply absent from discovery feeds

**Recommendation:**
Implement a scalable sitemap strategy:
- include all public top-level pages that should index
- add locale-aware entries for crawlable locale variants
- move from single-route hard caps to sitemap chunking/index files once content exceeds safe limits

---

## MEDIUM 2 — The homepage bypasses the public layout and misses the shared footer/link surface
**Evidence:**
- public layout renders `PublicFooter`: `src/app/(public)/layout.tsx:19-40`
- homepage is outside that layout and builds its own shell: `src/app/page.tsx:41-119`
- homepage does not render `PublicFooter`

**Why this matters:**
This is partly UX, but it also affects SEO. The homepage is the strongest crawl-entry document. If it skips shared footer links or policy links, internal linking depth and consistency suffer.

**Risk:**
- fewer persistent crawl paths from the strongest page
- inconsistent internal linking structure between `/` and the rest of the public site

**Recommendation:**
Refactor homepage shell reuse so the homepage participates in the same public layout/footer pattern as other public routes, or intentionally duplicate the footer there.

---

## MEDIUM 3 — Root/fallback metadata is weaker than page-level metadata
**Evidence:**
- root metadata does not define social images: `src/app/layout.tsx:38-60`
- root Twitter card falls back to `summary`, not `summary_large_image`: `src/app/layout.tsx:55-59`
- page-level helper is stronger than root fallback: `src/lib/seo.ts:168-195`

**Why this matters:**
When a public route forgets to provide its own metadata, the fallback should still be strong. Right now the helper is good, but the root fallback is materially weaker.

**Recommendation:**
Upgrade root metadata so the default fallback includes:
- OG image
- large-image Twitter card
- locale-aware OG locale if the route does not override
- optionally icons / manifest / app name parity

---

## MEDIUM 4 — Social previews exist, but route-specific enrichment is still thin
**Evidence:**
- OG image renderer only knows `title`, `description`, `siteTitle`, `section`, and locale label: `src/app/og/route.tsx:15-105`
- metadata helper does not support richer article/event fields beyond generic website/article tags: `src/lib/seo.ts:146-197`

**Why this matters:**
The current previews are acceptable, but they are still generic. Problem pages, contest pages, and community threads can expose more specific visual/contextual signals (problem number, difficulty, event dates, organization name, reply count, etc.).

**Recommendation:**
Add route-aware OG params and metadata extensions for the major entity types:
- problem: problem number, difficulty, tags
- contest: scheduled/windowed label, start date, host/group
- community: author/reply count/pinned state

---

## MEDIUM 5 — Structured data coverage is uneven across indexable public pages
**Evidence:**
- rankings page has metadata but no JSON-LD: `src/app/(public)/rankings/page.tsx:1-120`
- submissions page is indexed but should not be; if it remains public, it also lacks JSON-LD: `src/app/(public)/submissions/page.tsx:1-120`
- homepage emits `WebSite`, but not broader site-level schema such as `Organization` or `WebPage`: `src/app/page.tsx:57-64`

**Why this matters:**
JSON-LD is not the first priority compared with canonical/indexability, but it should be consistent once the crawl model is fixed.

**Recommendation:**
After indexability cleanup:
- add `CollectionPage`/`ItemList` or equivalent schema to remaining indexable listing pages
- consider site-level `Organization` + `WebPage` + breadcrumb coverage where useful

---

## LOW 1 — SEO regression coverage is currently out of sync with the implementation
**Evidence:**
- helper now emits `summary_large_image`: `src/lib/seo.ts:190-195`
- unit test still expects `summary`: `tests/unit/seo.test.ts:80-84`

**Why this matters:**
This is a process smell: SEO behavior changed, but the regression suite did not keep up. That makes future SEO work risky because passing tests may no longer mean behavior is correct.

**Recommendation:**
Expand SEO tests beyond helper snapshots:
- locale alternates
- canonical generation for paginated pages
- robots disallow coverage for personal routes
- sitemap coverage for localized/public surfaces
- OG/Twitter image URL presence

---

## Priority Order

1. **Fix indexability boundaries** (`/submissions`, `/submissions/[id]`, any other personal/public-auth surfaces)
2. **Make locale URLs deterministic for public SEO**
3. **Correct canonical behavior for pagination/search variants**
4. **Upgrade sitemap to cover locale/public variants and growth**
5. **Strengthen social preview fallback + route-specific OG enrichment**
6. **Normalize structured data coverage and tests**

---

## Recommended Decision

### Short-term decision
Keep the current helper-based SEO stack, but **stop treating the existing locale/canonical/sitemap layer as complete**. It is a strong base, not a finished SEO system.

### Long-term decision
Adopt a **URL-first public SEO model**:
- deterministic public locale URLs
- explicit indexability rules
- sitemap that mirrors real crawlable URLs
- page-class-specific metadata policy (marketing/indexable vs account/noindex)

That change will create more SEO value than adding a few more keywords or JSON-LD blocks.
