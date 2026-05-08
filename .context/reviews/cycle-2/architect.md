# Cycle 2/3 — Architect

**HEAD:** main / 2198a39b

## Architectural diagnosis

The post-migration shape of navigation has three layers but only two are real:

| Layer | File(s) | Status |
|---|---|---|
| Top nav (primary) | `lib/navigation/public-nav.ts:getPublicNavItems`, `components/layout/public-header.tsx` | live, cap-unaware |
| Avatar dropdown (personal + admin gateway) | `lib/navigation/public-nav.ts:DROPDOWN_ITEM_DEFINITIONS` | live, cap-aware |
| Admin sidebar (secondary nav for `/dashboard/admin/*`) | `components/layout/app-sidebar.tsx` | **DEAD** — not mounted |
| Admin landing card grid (replacement entry-point) | `app/(dashboard)/dashboard/admin/page.tsx` | live, cap-aware |
| Admin "quick shortcuts" on `/dashboard` | `app/(public)/dashboard/_components/admin-dashboard.tsx` | live, cap-aware |

The architectural error: cycle 1 migrated to "card grid as the admin home" but kept the sidebar in tree, **and** never deleted the dead chrome. Admin pages now have NO secondary nav, only chrome that points back at the landing.

## Recommended target architecture (this cycle)

```
src/lib/navigation/
  public-nav.ts        ← top nav + dropdown (cap-aware, both)
  admin-nav.ts         ← NEW: ADMIN_NAV_GROUPS single source

src/components/layout/
  public-header.tsx    ← unchanged
  admin-section-nav.tsx ← NEW: small horizontal/segmented nav for /dashboard/admin/*
                         (sticky under breadcrumb, consumes admin-nav.ts)
  breadcrumb.tsx       ← unchanged
  active-timed-assignment-banner.tsx ← MOVED from sidebar-panel; shown in chrome
  app-sidebar.tsx      ← DELETED
  conditional-header.tsx ← DELETED
```

Decision matrix for admin secondary nav:
- **Sidebar (re-mount)**: heavyweight, requires `SidebarProvider`, fights top-nav width.
- **Horizontal section nav (recommended)**: light, sticky under breadcrumb, fits the existing `(dashboard)/layout.tsx` shell, mobile-friendly via overflow-x scroll.

## Migration steps
1. Add `lib/navigation/admin-nav.ts`.
2. Refactor `dashboard/admin/page.tsx` and `dashboard/_components/admin-dashboard.tsx` to consume it.
3. Add `components/layout/admin-section-nav.tsx`; wire into `(dashboard)/layout.tsx` only (admin pages live there).
4. Delete `app-sidebar.tsx`, its tests, `conditional-header.tsx`, its tests.
5. Re-host `ActiveTimedAssignmentSidebarPanel` content as a banner in `(public)/layout.tsx` and `(dashboard)/layout.tsx` chrome — gated to users with active timed assignments.
6. Add `capabilities?: string[]` to `getPublicNavItems(t, capabilities)`; thread through both layouts.
7. Rewrite the two stale unit tests against the new contract.

## Confidence
HIGH on the diagnosis. MEDIUM on whether to fully ship admin-section-nav this cycle or defer it after the deletions land — depending on time. The deletions and admin-nav single source are the must-haves.
