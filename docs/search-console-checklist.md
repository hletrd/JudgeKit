# Search Console / SEO Launch Checklist

Use this checklist after SEO or Open Graph changes ship to production.

## 1. Verify crawl controls

- [ ] `robots.txt` returns HTTP 200
- [ ] `Host:` matches the production origin
- [ ] `Sitemap:` points at the production sitemap
- [ ] Private routes remain blocked from crawling:
  - `/api`
  - `/dashboard`
  - `/workspace`
  - `/control`
  - `/login`
  - `/signup`
  - `/change-password`
  - `/recruit`
  - `/community/new`
  - `/submissions`

Quick check:

```bash
curl -s https://your-domain.example/robots.txt
```

## 2. Verify sitemap health

- [ ] `sitemap.xml` returns HTTP 200
- [ ] Static public routes are listed:
  - `/`
  - `/practice`
  - `/playground`
  - `/contests`
  - `/community`
  - `/rankings`
- [ ] Public problem / contest / discussion detail pages appear when data exists
- [ ] `hreflang` alternates exist for supported locales

Quick check:

```bash
curl -s https://your-domain.example/sitemap.xml | head -n 40
```

## 3. Verify page metadata

For each important public route, confirm:

- [ ] `<title>` is unique and descriptive
- [ ] `<meta name="description">` is present
- [ ] canonical URL points to the rendered route
- [ ] `hreflang` alternates are present for `en`, `ko`, and `x-default`
- [ ] Open Graph tags exist:
  - `og:title`
  - `og:description`
  - `og:image`
- [ ] Twitter tags exist:
  - `twitter:card`
  - `twitter:title`
  - `twitter:description`
  - `twitter:image`

Recommended sample URLs:

- `/`
- `/practice`
- `/playground`
- `/contests`
- `/community`
- `/rankings`
- one public problem detail page
- one public contest detail page (if any)
- one public community thread (if any)

## 4. Verify structured data

- [ ] Home / list pages emit JSON-LD
- [ ] Problem detail emits article-style JSON-LD + breadcrumb
- [ ] Contest detail emits event JSON-LD + breadcrumb
- [ ] Community thread emits discussion JSON-LD + breadcrumb
- [ ] Structured data references the canonical URL
- [ ] Structured data includes image / author / publisher where applicable

## 5. Verify OG image generation

- [ ] `/og?...` returns HTTP 200
- [ ] `content-type` is `image/png`
- [ ] Long titles truncate cleanly
- [ ] Badge / meta / footer text render without clipping
- [ ] The generated image visually matches current branding

Quick check:

```bash
curl -I 'https://your-domain.example/og?title=SEO+Check&locale=en&siteTitle=Your+Site&description=Verification'
```

## 6. Search Console actions

- [ ] Open **URL Inspection** for `/`
- [ ] Open **URL Inspection** for `/practice`
- [ ] Open **URL Inspection** for one public detail page
- [ ] Request indexing for any changed public URLs
- [ ] Re-submit `sitemap.xml` if canonical/URL structure changed
- [ ] Confirm there are no new "Crawled - currently not indexed" surprises for important public pages
- [ ] Confirm excluded routes are intentionally excluded (private/app/auth)

## 7. Social preview checks

- [ ] Share home URL in a preview/debugger tool
- [ ] Share one problem detail URL
- [ ] Share one contest detail URL (if available)
- [ ] Share one community thread URL (if available)
- [ ] Confirm OG image, title, and description are correct

## 8. Production smoke commands

Replace the domain as needed.

```bash
curl -I https://oj.auraedu.me/
curl -s https://oj.auraedu.me/robots.txt
curl -s https://oj.auraedu.me/sitemap.xml | head -n 20
curl -I 'https://oj.auraedu.me/og?title=SEO+Check&locale=en&siteTitle=AuraEdu&description=Verification'
```

## 9. What to watch after launch

- Search Console coverage changes over 24-72 hours
- Unexpected noindex/canonical conflicts
- OG image route failures (`/og` 5xx)
- Locale alternate regressions (`hreflang` missing or cross-wired)
- Metadata drift after content or route changes
