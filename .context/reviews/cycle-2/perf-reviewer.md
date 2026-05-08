# Cycle 2/3 — Performance Reviewer

**HEAD:** main / 2198a39b

## P2-01 — `(public)/layout.tsx` resolves capabilities even for non-admins — LOW / HIGH
- File: `src/app/(public)/layout.tsx:21`
- Evidence: `await resolveCapabilities(session.user.role)` is called for *every* authenticated request to a public page. Cap resolution hits Redis/DB (per `lib/capabilities/cache`).
- Fail mode: extra DB roundtrip on every public page render for logged-in users.
- Fix (cap-aware top nav, see designer D2-08): pass capabilities to `getPublicNavItems` and `getDropdownItems`. Cap resolution is already happening, so cost is amortized — but verify the cache hit rate stays high in production.
- **Net effect:** no regression; the cap-aware top nav reuses the resolved caps. RECORD ONLY.

## P2-02 — `(dashboard)/layout.tsx` calls `getResolvedSystemSettings` twice in parallel with `getTranslations` — LOW / MEDIUM
- File: `src/app/(dashboard)/layout.tsx:32-43`
- Evidence: Inside `Promise.all` the call to `getResolvedSystemSettings({ siteTitle: (await getTranslations("common"))("appName"), ... })` awaits `getTranslations("common")` *inside* the promise, then again `await getTranslations("common")` for `siteDescription`. This is a code smell but next-intl caches translations so cost is near-zero.
- Fix (optional): hoist `tCommon` resolution before the `Promise.all`. Cosmetic.
- Confidence: HIGH (minor).

## P2-03 — Deleting AppSidebar removes its server-side `getActiveTimedAssignmentsForSidebar` data path — INFO / HIGH
- File: `src/app/(dashboard)/layout.tsx:14`
- Evidence: `getActiveTimedAssignmentsForSidebar` is imported but **NOT called** in the cycle-2 baseline (deferred dead-code from migration). After AppSidebar deletion this import becomes definitively dead and should be removed.
- Fix: drop the import.

## P2-04 — Suspense fallbacks render full skeleton stacks for admin even though admin dashboard streams quickly — INFO
- File: `src/app/(public)/dashboard/page.tsx:108-117`
- Evidence: 2 large skeletons; in practice `getAdminHealthSnapshot` returns in <50ms for warm cache. No action.

## Verdict
No new perf regressions. Cleanup-only cycle. Minor dead-import cleanup recommended in `(dashboard)/layout.tsx`.
