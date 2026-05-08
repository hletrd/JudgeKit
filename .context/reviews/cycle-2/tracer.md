# Cycle 2/3 — Tracer

**HEAD:** main / 2198a39b
**Question:** how does an admin user navigate from `/dashboard/admin/users` to `/dashboard/admin/workers` today?

## Trace

1. User on `/dashboard/admin/users`.
2. Layout: `src/app/(dashboard)/layout.tsx` renders `<PublicHeader />` (top nav with Practice / Playground / Contests / Rankings / Submissions / Community) + `<Breadcrumb />` + `{children}` + `<PublicFooter />`. **No sidebar.** No admin section nav.
3. Top nav has zero admin entries. Breadcrumb shows `Home > Administration > User Management`. Avatar dropdown has "Administration" entry.
4. To switch to Workers, the user must:
   - (a) click breadcrumb "Administration" → land on `/dashboard/admin` (card grid).
   - (b) Find Workers card in System group, click → `/dashboard/admin/workers`.
   - That's TWO clicks plus visual scan, every section switch.

## Counterfactual: what was intended (per AppSidebar code)

`AppSidebar` defines `adminGroups` with all admin items, and per `app-sidebar.tsx:178-249` would render a persistent left rail. If mounted, switching is ONE click. But it is not mounted.

## Trace conclusion

Admin secondary nav is missing in the live app. This is the root cause of the user's "menu hierarchy confusing" complaint. Cycle 2 must fix this either by re-mounting the sidebar OR providing a horizontal section nav.

## Adjacent traces

- `getActiveTimedAssignmentsForSidebar` import in `(dashboard)/layout.tsx:14` is dead (function not called).
- `ConditionalHeader` is dead (no production caller).
- `messages/en.json:adminQuickActions` is misleading after the chip wall removal.

## Confidence
HIGH. Direct path traced from user click through compiled output.
