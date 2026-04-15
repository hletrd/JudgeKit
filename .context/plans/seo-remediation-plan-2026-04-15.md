# SEO Remediation Plan — JudgeKit

**Date:** 2026-04-15  
**Source review:** `.context/reviews/seo-review-2026-04-15-current-head.md`  
**Commit baseline:** `03011b0`

---

## Requirements Summary

JudgeKit needs a public SEO system that is:
1. **URL-deterministic** for locale variants
2. **safe** about private/personal pages never being indexed
3. **complete** enough for search engines to discover public content at scale
4. **consistent** across metadata, structured data, sitemap, and social previews
5. **verified** by tests so future UI work does not silently regress SEO

---

## Acceptance Criteria

### Crawlability / Indexability
- [ ] All personal/authenticated public-surface routes are `noindex, nofollow`
- [ ] `robots.txt` disallows all non-indexable public-auth routes, including `/submissions`
- [ ] Every intentionally indexable public page has explicit metadata ownership

### Locale SEO
- [ ] Public locale variants resolve from deterministic crawlable URLs, not only cookie/header state
- [ ] `hreflang` / alternates point to the true crawlable locale URLs
- [ ] sitemap includes locale-aware URLs for all indexable public pages

### Canonical Strategy
- [ ] Paginated collection pages have an explicit canonical policy
- [ ] Search/filter states are either `noindex, follow` or emit canonical URLs that match the intended index target
- [ ] No page-2/page-3 collection silently canonicalizes to page 1 by accident

### Social Previews
- [ ] Root fallback metadata includes large-image OG/Twitter coverage
- [ ] Major public entity pages (home, problem, contest, community thread) render strong route-specific OG images
- [ ] OG/Twitter metadata remains correct in both `en` and `ko`

### Structured Data
- [ ] All intentionally indexable public listings/details emit appropriate JSON-LD
- [ ] Breadcrumb/site-level schema is added where it improves clarity without overfitting

### Verification
- [ ] Unit tests cover metadata helper, robots, sitemap, locale alternates, and noindex rules
- [ ] Component/page-level tests assert key metadata behavior on critical public routes
- [ ] Manual verification checklist exists for live preview cards and locale variants

---

## Implementation Plan

## Phase 0 — Lock the SEO policy before touching implementation
**Goal:** avoid inconsistent fixes across pages.

### Step 0.1 — Define the public route SEO matrix
**Files:**
- `src/app/page.tsx`
- `src/app/(public)/**`
- `src/app/(auth)/**`
- `src/app/(dashboard)/**`
- `src/app/(workspace)/**`
- `src/app/(control)/**`

**Work:**
Create a route-class matrix listing each public pathname bucket and whether it should be:
- indexable
- localized
- included in sitemap
- eligible for JSON-LD
- eligible for social cards

**Must decide explicitly:**
- `/submissions`
- `/submissions/[id]`
- `/rankings`
- `/signup`
- `/login`
- `/community/new`

**Output:** add this matrix to the implementation PR description or a local project note before coding.

---

## Phase 1 — Fix indexability boundaries first
**Goal:** stop accidental indexing of personal/account content.

### Step 1.1 — Noindex authenticated public submission surfaces
**Files:**
- `src/app/(public)/submissions/page.tsx`
- `src/app/(public)/submissions/[id]/page.tsx`
- `src/lib/seo.ts`

**Work:**
- replace `buildPublicMetadata()` on `/submissions` with `NO_INDEX_METADATA`-based metadata
- add explicit metadata/noindex to `/submissions/[id]`
- ensure these routes do not emit public canonical/OG intended for indexing

### Step 1.2 — Expand robots disallow list
**Files:**
- `src/app/robots.ts`
- `tests/unit/robots.test.ts`

**Work:**
- add `/submissions` to disallow list
- evaluate whether any other public-auth utility pages belong there

**Verification:**
- unit test asserts new disallow rules

---

## Phase 2 — Make locale SEO URL-first
**Goal:** remove ambiguity between rendered locale and canonical locale URL.

### Option A (preferred) — Locale-prefixed public routes
**Files likely impacted:**
- `src/i18n/request.ts`
- `src/proxy.ts`
- `src/lib/seo.ts`
- `src/components/layout/locale-switcher.tsx`
- public page link builders / pagination helpers
- routing configuration if present elsewhere

**Approach:**
Adopt `/ko/...` for Korean public pages and keep `/...` as English default (or `/en/...` + `/ko/...` if you want full symmetry).

**Pros:**
- strongest crawl model
- easiest hreflang correctness
- clearest cache behavior

**Cons:**
- broader routing changes
- requires link/pagination updates everywhere

### Option B (smaller change) — Query-param locale, but only from explicit locale URLs
**Files:** same as above

**Approach:**
Keep `?locale=ko`, but make public SEO pages canonicalize/render only from explicit locale URLs; reduce cookie/header-driven locale variation for indexable pages.

**Pros:**
- smaller diff
- less routing churn

**Cons:**
- weaker long-term SEO model than path-based locales
- easier to regress later

### Step 2.1 — Normalize locale URL building
**Files:**
- `src/lib/seo.ts`
- `src/components/layout/locale-switcher.tsx`
- public pagination/link components

**Work:**
- ensure every locale variant has one stable crawlable URL
- ensure locale switcher exposes actual crawlable URLs, not only JS state mutation
- keep `x-default` aligned with the English/default public landing URL

### Step 2.2 — Reduce cookie/header dependence for indexable public content
**Files:**
- `src/i18n/request.ts`
- `src/proxy.ts`

**Work:**
- keep cookie/header locale preference for UX if desired
- but make the public indexable URL the source of truth for locale rendering and canonical generation

**Verification:**
- request `/practice` in default locale and verify English canonical
- request localized variant and verify Korean canonical/hreflang/html `lang`

---

## Phase 3 — Correct canonical handling for pagination and search states
**Goal:** eliminate duplicate-content ambiguity.

### Step 3.1 — Add page-aware metadata for paginated collections
**Files:**
- `src/app/(public)/practice/page.tsx`
- `src/app/(public)/rankings/page.tsx`
- any other paginated public listing routes

**Work:**
- accept `searchParams` in `generateMetadata()` where needed
- decide whether page 2+ should self-canonicalize or consolidate
- add page numbers into titles/descriptions when indexable

### Step 3.2 — Mark search/filter states as non-indexable where appropriate
**Files:**
- `src/app/(public)/submissions/page.tsx`
- any searchable public list routes

**Work:**
- for query-driven search states, prefer `noindex, follow`
- avoid canonical ambiguity between filtered and unfiltered states

**Verification:**
- unit tests for page 1 vs page 2 canonical output
- unit tests for filtered state `robots` behavior

---

## Phase 4 — Upgrade sitemap to match real crawlable URLs
**Goal:** make sitemap a reliable mirror of all intended public entry points.

### Step 4.1 — Fill missing public top-level pages
**Files:**
- `src/app/sitemap.ts`
- `tests/unit/sitemap.test.ts`

**Work:**
- include `/rankings` if indexable
- exclude anything personal/auth-only

### Step 4.2 — Emit locale-aware entries
**Files:**
- `src/app/sitemap.ts`
- `src/lib/seo.ts`

**Work:**
- add per-locale URL entries for public indexable pages
- if Next metadata sitemap supports alternates cleanly in this app version, use it; otherwise emit explicit localized entries

### Step 4.3 — Prepare for growth beyond hard caps
**Files:**
- `src/app/sitemap.ts`
- possibly new sitemap chunk routes/index route

**Work:**
- replace fixed 500/500/200 caps with chunked sitemap generation once content volume demands it
- keep the initial implementation small if current content volume is low, but leave a path for sitemap index expansion

**Verification:**
- unit tests cover locale entries and missing-page additions
- manual check of `/sitemap.xml`

---

## Phase 5 — Strengthen social previews
**Goal:** make shared links consistently attractive and localized.

### Step 5.1 — Improve root fallback metadata
**Files:**
- `src/app/layout.tsx`
- `src/lib/seo.ts`

**Work:**
- upgrade root fallback to large-image cards
- add default social image
- align root fallback with page helper behavior

### Step 5.2 — Add route-aware OG params
**Files:**
- `src/lib/seo.ts`
- `src/app/og/route.tsx`
- major public detail pages

**Work:**
Support richer preview inputs such as:
- problem number/difficulty/tag
- contest mode/date/group
- thread reply count / author

### Step 5.3 — Keep locale and copy quality aligned
**Files:**
- `src/app/og/route.tsx`
- page metadata call sites
- `messages/en.json`
- `messages/ko.json`

**Work:**
- ensure Korean OG copy is intentionally written, not just mechanically translated labels
- ensure English remains default fallback

**Verification:**
- manual preview QA with real URLs for home, practice, problem detail, contest detail, and community thread

---

## Phase 6 — Finish structured data consistency
**Goal:** cover all remaining indexable surfaces without schema spam.

### Step 6.1 — Add missing JSON-LD on remaining indexable listing pages
**Files:**
- `src/app/(public)/rankings/page.tsx`
- other public indexable pages lacking JSON-LD

### Step 6.2 — Add breadcrumb/site-level schema where it helps
**Files:**
- homepage and detail pages

**Work:**
- breadcrumb schema for detail pages if the route hierarchy is stable
- optionally `Organization` schema for the site/global shell

**Constraint:**
Do not add decorative schema that the actual UI/content does not support.

---

## Phase 7 — Repair and expand SEO regression coverage
**Goal:** make future SEO changes safe.

### Step 7.1 — Update stale helper tests
**Files:**
- `tests/unit/seo.test.ts`

**Work:**
- align Twitter card expectation with current `summary_large_image`
- assert image URLs and locale alternates

### Step 7.2 — Add route-policy tests
**Files:**
- `tests/unit/robots.test.ts`
- `tests/unit/sitemap.test.ts`
- new page/component tests as needed

**Work:**
- assert `/submissions` is blocked/noindexed
- assert sitemap includes intended pages and excludes private ones
- assert locale variants render correct canonical/hreflang

### Step 7.3 — Add a manual verification checklist
**Suggested checks:**
- view source for `/`, `/practice`, `/practice/problems/:id`, `/contests/:id`, `/community/threads/:id`
- verify canonical / alternates / OG image URLs in `en` and `ko`
- verify `/submissions` emits noindex
- verify `/sitemap.xml` and `/robots.txt`
- verify shared links render correct cards in Slack/Discord/X preview tools

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Locale URL changes break internal links | High | ship helper-first refactor, update all public link builders in one pass |
| Locale migration creates duplicate pages temporarily | High | lock canonical/hreflang rules before rollout; test both locales before deploy |
| Over-indexing query states continues | Medium | explicitly classify search/filter routes as `noindex, follow` |
| Sitemap changes miss older content | Medium | add tests and chunking strategy instead of manual caps only |
| Social preview changes regress cards silently | Medium | add test coverage + manual preview checklist |

---

## Verification Plan

### Automated
- `npx tsc --noEmit`
- `npx vitest run tests/unit/seo.test.ts tests/unit/robots.test.ts tests/unit/sitemap.test.ts`
- add targeted page/component tests for critical metadata policies

### Manual
- inspect rendered `<head>` for representative pages
- verify locale-specific URLs produce locale-specific canonical/hreflang
- verify `robots.txt` and `sitemap.xml`
- verify OG cards on at least one external preview tool per major page type

---

## Recommended Execution Order

1. Phase 1 — indexability boundaries
2. Phase 2 — locale URL model
3. Phase 3 — canonical/page-param handling
4. Phase 4 — sitemap parity
5. Phase 5 — social preview enrichment
6. Phase 6 — structured data cleanup
7. Phase 7 — regression hardening

This order minimizes the risk of polishing metadata on URLs that should not be indexed in the first place.
