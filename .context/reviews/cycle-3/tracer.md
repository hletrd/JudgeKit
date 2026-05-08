# Cycle 3/3 — Tracer

**HEAD:** c6f92a37

## Trace 1: anonymous visitor lands on `/`
- `(public)/layout.tsx` → `auth()` returns null → `capabilities` = undefined → `getPublicNavItems(t, undefined)` returns 6 base items, no Groups / Problem Sets. `loggedInUser=null` so PublicHeader shows Sign In / Sign Up actions. PASS.

## Trace 2: instructor with `groups.view_all + problem_sets.view + assignments.view_status`
- `(public)/layout.tsx` → caps resolved → `getPublicNavItems` returns 8 items including Groups + Problem Sets. PublicHeader renders dropdown. PASS.
- Visits `/dashboard` → `page.tsx` evaluates `canReviewAssignments=true`, `hasAdminWorkspace=false` → `isInstructorView=true`. Renders InstructorDashboard + DashboardJudgeSystemSection. PASS.

## Trace 3: admin with `system.settings` ONLY (no users.view)
- Visits `/dashboard` → `hasAdminWorkspace=true` (system.settings) → `isAdminView=true`. Renders AdminDashboard. AdminDashboard shows the CTA card (always); Quick links list filters to `findAdminNavItem("/dashboard/admin/settings")` — only "System Settings" passes the cap filter (Users + Workers fail). Renders one outline button. PASS.
- Clicks "Administration" → `/dashboard/admin` → `(dashboard)/layout.tsx` → resolveCapabilities → admin landing renders System group (5 cards: Workers, Languages, Settings, API Keys, Tags). Users & Logs group filtered out. PASS.

## Trace 4: admin with `users.view` ONLY (no system.settings)
- `/dashboard` → AdminDashboard CTA renders. `canViewHealth=false` so health card + judge-system tabs hidden. Quick links: only `findAdminNavItem("/dashboard/admin/users")` passes — one button. PASS.
- `/dashboard/admin` → renders only Users & Logs group with User Management card. PASS.

## Trace 5: candidate in recruiting mode lands on `/dashboard`
- `effectivePlatformMode="recruiting"`, `canReviewAssignments=false`, `hasAdminWorkspace=false` → `isCandidateView=true`. Renders CandidateDashboard. PASS.
- Per task brief: candidate is supposed to land on `/contests/X`. The redirect is handled upstream (recruit-token route + `getRecruitingAccessContext`); not the dashboard's job. RECORD.

## Trace 6: admin opens mobile menu on `/dashboard/admin/users`
- `(dashboard)/layout.tsx` mounts PublicHeader with `trailingSlot=<PlatformModeBadge>`. Mobile drawer opens; lists 8 base nav items + Groups/Problem-Sets if cap-gated, dropdown items below. Sign-out button at bottom. PASS.

## Trace 7: instructor on `/groups`
- `(public)/layout.tsx` → caps resolved (instructor has `groups.view_all`) → top nav includes /groups. Active-state highlight applies via `isActivePath`. PASS.

## Verdict
All traces clear. No nav-related regressions.
