# Tracer Review — RPF Cycle 2 (2026-05-04)

**Reviewer:** tracer
**HEAD reviewed:** `767b1fee`

---

## Causal trace of recent changes

### ConditionalHeader flow
1. `src/app/(dashboard)/layout.tsx:75` — renders `<ConditionalHeader>`
2. `src/components/layout/conditional-header.tsx` — checks `usePathname().startsWith("/dashboard/admin")`
3. If admin: renders minimal header with only `<SidebarTrigger />`
4. If non-admin: renders full `<PublicHeader />` with nav items and actions

**Trace result:** Clean flow. No competing paths. The `SidebarTrigger` is present in both branches, so sidebar toggle works on all dashboard pages.

### i18n metadata flow (contest page)
1. `src/app/(public)/contests/[id]/page.tsx:44-58` — `generateMetadata()` fetches contest
2. If no contest: returns `tContest("metadataFallbackTitle")` with `NO_INDEX_METADATA`
3. If contest exists: builds full metadata with `tContest("keywords.*")` keys

**Trace result:** Clean. No missing error paths. The `metadataFallbackTitle` key exists in both `en.json` and `ko.json`.

### Recruiting validate flow
1. `src/app/api/v1/recruiting/validate/route.ts` — POST handler
2. Rate limit check → CSRF validation → body parse → token hash → DB lookup (SQL NOW() for expiry) → uniform `invalid()` response
3. Two DB queries: invitation lookup, then assignment deadline check

**Trace result:** Clean. No information leakage via uniform response. SQL NOW() avoids clock skew.

---

## Findings

No new tracer findings this cycle. All recent changes have clean causal flows with no competing hypotheses or suspicious paths.
