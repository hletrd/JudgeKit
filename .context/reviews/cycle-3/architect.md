# Cycle 3/3 — Architect

**HEAD:** c6f92a37

## Final shape of navigation surfaces

| Surface | File | Purpose |
|---|---|---|
| Top nav (primary, cap-aware) | `lib/navigation/public-nav.ts:getPublicNavItems` + `components/layout/public-header.tsx` | Practice / Playground / Contests / Rankings / Submissions / Community + cap-gated Groups, Problem Sets |
| Avatar dropdown (personal + admin gateway) | `lib/navigation/public-nav.ts:DROPDOWN_ITEM_DEFINITIONS` + PublicHeader dropdown | Dashboard / Profile / My submissions / Groups / Problem sets / Admin (gated) |
| Admin landing index (canonical admin home) | `app/(dashboard)/dashboard/admin/page.tsx` | Capability-filtered card grid sourced from `ADMIN_NAV_GROUPS` |
| Admin shortcuts on `/dashboard` | `app/(public)/dashboard/_components/admin-dashboard.tsx` | Curated 3-shortcut shortlist sourced from same `ADMIN_NAV_GROUPS` (via `findAdminNavItem`) |
| Breadcrumb | `components/layout/breadcrumb.tsx` | Linked, schema.org-annotated, segment-mapped to i18n keys |
| Platform mode badge | `components/layout/platform-mode-badge.tsx` | `(dashboard)/layout.tsx` trailing slot; visible on every admin page |

This is the final post-migration shape. It is sound. No new abstractions needed.

## Architectural debt remaining
- **No persistent in-admin-section nav.** Switching `/dashboard/admin/users` → `/dashboard/admin/workers` requires breadcrumb-up. The cycle-2 plan B1 (`admin-section-nav.tsx`) deferral remains valid — designing this is meaningful UX work and should not happen in a closeout cycle. Document and ship in a future dedicated IA cycle.
- **`getActiveTimedAssignmentsForSidebar` helper is orphaned.** No surface consumes it. Either rename to `getActiveTimedAssignments` and let a future banner/floating widget pick it up, or delete and reintroduce later.
- **Stale comments** in 4 files reference deleted `AppSidebar`. Trivial fix.

## Confidence
HIGH. The shape is correct; the remaining items are housekeeping.
