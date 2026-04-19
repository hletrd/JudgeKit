# Designer

**Date:** 2026-04-19
**Base commit:** b91dac5b
**Angle:** UI/UX review — accessibility, responsiveness, i18n, perceived performance

---

## F1: Proxy matcher does not include `/languages` public route — missing CSP headers

- **File**: `src/proxy.ts:301-319`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The proxy matcher includes `/practice/:path*`, `/rankings`, and other public routes, but does not include `/languages` (the public languages page at `src/app/(public)/languages/page.tsx`). This means the `/languages` page does not receive the CSP headers, HSTS, or other security headers set by `createSecuredNextResponse`. Same finding as code-reviewer F5.
- **Concrete failure scenario**: The `/languages` page loads without CSP headers, making it slightly less protected against XSS attacks than other public pages.
- **Fix**: Add `/languages` to the proxy matcher config.

## F2: SSE connection tracking eviction may cause "too many connections" errors for legitimate users

- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:41-44`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: Same finding as debugger F2. If the tracking map evicts an active connection's entry, the per-user count is decremented, which could lead to users exceeding the connection limit. From a UX perspective, this means a user who already has max connections might see "too many connections" errors on subsequent requests, or conversely, might be allowed to exceed the limit.
- **Concrete failure scenario**: During a contest with many simultaneous SSE connections, a user's tracking entry is evicted. They see inconsistent connection management behavior.
- **Fix**: Same as debugger F2.

## Previously Verified Safe (Prior Cycles)

- Semantic headings on public/auth routes — fixed in cycle 1 (UX-01)
- Public-header ARIA labels — localized in cycle 1 (UX-02)
- `FilterSelect` compliance — fixed in cycle 1 (UI-01)
- IOI cell dark mode contrast — improved in cycle 21 (L8)
