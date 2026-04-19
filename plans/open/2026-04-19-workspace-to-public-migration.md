# Workspace-to-Public Page Migration Plan

**Date:** 2026-04-19
**Status:** Phase 1 COMPLETE, Phase 2 COMPLETE, Phase 3 IN PROGRESS (cycle 14 — add contests to dropdown, continue sidebar refinement), Phase 4 PENDING
**Source:** User-injected TODO #2, AGG-13

## Goal

Deprecate the `(workspace)` route group and consolidate navigation into a unified top-navbar layout under `(public)`. The current three-route-group split (workspace, dashboard, control) creates redundant auth-gated shells and forces users through multiple navigation paradigms. The target is a single public-facing layout with a top navbar that adapts its items based on auth status and role.

---

## Current Route Group Inventory

### (public) — No auth required
Layout: `PublicHeader` (top nav) + `PublicFooter`, max-w-6xl centered content.

| Route | Page | Auth required |
| --- | --- | --- |
| `/` | Home page | No |
| `/practice` | Practice problem browser | No |
| `/playground` | Code playground | No |
| `/contests` | Public contest list | No |
| `/rankings` | Public rankings | No |
| `/submissions` | Public submission feed | No |
| `/community` | Discussion threads | No |
| `/languages` | Language reference | No |
| `/users/[id]` | Public user profile | No |

### (workspace) — Auth required, sidebar nav
Layout: `WorkspaceNav` (left sidebar) + top-right header with ThemeToggle/LocaleSwitcher.

| Route | Page | Auth required | Notes |
| --- | --- | --- | --- |
| `/workspace` | Redirect to `/dashboard` | Yes | Entry point only |
| `/workspace/discussions` | My discussions list | Yes | User-specific discussion threads |

### (dashboard) — Auth required, full sidebar layout
Layout: `SidebarProvider` + `AppSidebar` + `Breadcrumb` + `Toaster` + `ChatWidgetLoader` + `LectureModeProvider`.

| Route | Page | Auth required | Role gate |
| --- | --- | --- | --- |
| `/dashboard` | Role-based dashboard | Yes | Any authenticated user |
| `/dashboard/problems` | Problem management | Yes | Any |
| `/dashboard/problems/[id]` | Problem detail | Yes | Any |
| `/dashboard/problems/[id]/edit` | Edit problem | Yes | Instructor+ |
| `/dashboard/problems/[id]/rankings` | Problem rankings | Yes | Any |
| `/dashboard/problems/create` | Create problem | Yes | Instructor+ |
| `/dashboard/contests` | Contest list | Yes | Any |
| `/dashboard/contests/[assignmentId]` | Contest detail | Yes | Any |
| `/dashboard/contests/create` | Create contest | Yes | Instructor+ |
| `/dashboard/contests/join` | Join contest | Yes | Any |
| `/dashboard/submissions` | My submissions | Yes | Any |
| `/dashboard/submissions/[id]` | Submission detail | Yes | Any |
| `/dashboard/profile` | Profile editor | Yes | Any |
| `/dashboard/groups` | Group management | Yes | Instructor+ |
| `/dashboard/groups/[id]` | Group detail | Yes | Instructor+ |
| `/dashboard/rankings` | Personalized rankings | Yes | Any |
| `/dashboard/languages` | Authenticated language view | Yes | Any |
| `/dashboard/compiler` | Online compiler | Yes | Any |
| `/dashboard/problem-sets` | Problem set management | Yes | Instructor+ |
| `/dashboard/admin/*` | Admin panel (8 sub-sections) | Yes | Admin only |
| `/dashboard/admin/users` | User management | Yes | Admin |
| `/dashboard/admin/settings` | System settings | Yes | Admin |
| `/dashboard/admin/languages` | Language config | Yes | Admin |
| `/dashboard/admin/tags` | Tag management | Yes | Admin |
| `/dashboard/admin/audit-logs` | Audit log viewer | Yes | Admin |
| `/dashboard/admin/login-logs` | Login log viewer | Yes | Admin |
| `/dashboard/admin/workers` | Worker management | Yes | Admin |
| `/dashboard/admin/api-keys` | API key management | Yes | Admin |
| `/dashboard/admin/plugins` | Plugin management | Yes | Admin |
| `/dashboard/admin/files` | File management | Yes | Admin |
| `/dashboard/admin/submissions` | All submissions | Yes | Admin |
| `/dashboard/admin/roles` | Role management | Yes | Admin |

### (control) — Auth + capability check, sidebar nav
Layout: `ControlNav` (left sidebar) + top-right header.

| Route | Page | Auth required | Role gate |
| --- | --- | --- | --- |
| `/control` | Control panel home | Yes | Admin/Instructor |
| `/control/discussions` | Discussion moderation | Yes | `community.moderate` |

---

## Categorization

### Can move to public (auth-aware rendering)

These pages already have public counterparts or can render differently based on auth status:

| Current route | Public route | Migration notes |
| --- | --- | --- |
| `/workspace/discussions` | `/community?filter=mine` | Add "My Discussions" filter tab to existing `/community` page. When unauthenticated, hide the filter. |
| `/dashboard/rankings` | `/rankings` | Already has a public counterpart. Dashboard version adds personalized context — merge by adding auth-aware section. |
| `/dashboard/languages` | `/languages` | Already has a public counterpart. Dashboard version is identical — remove dashboard version. |
| `/dashboard/compiler` | `/playground` | Already has a public counterpart. Consider merging or cross-linking. |

### Must stay in authenticated area

These pages handle sensitive data or write operations:

| Current route | Reason | Migration notes |
| --- | --- | --- |
| `/dashboard` | Personal dashboard with role-specific widgets | Stays in `(dashboard)` but simplify its nav integration |
| `/dashboard/problems/create` | Write operation (instructor+) | Stays gated |
| `/dashboard/problems/[id]/edit` | Write operation (instructor+) | Stays gated |
| `/dashboard/contests/create` | Write operation (instructor+) | Stays gated |
| `/dashboard/groups` | Student roster data | Stays gated |
| `/dashboard/groups/[id]` | Student grades and submissions | Stays gated |
| `/dashboard/profile` | Personal settings | Stays gated |
| `/dashboard/submissions` | User submission history | Stays gated |
| `/dashboard/admin/*` | System administration | Stays gated (admin only) |
| `/control/discussions` | Moderation tools | Stays gated |

### Can be removed entirely

| Current route | Reason |
| --- | --- |
| `/workspace` | Already just a redirect to `/dashboard` |

---

## Proposed Top Navbar Layout

### Unauthenticated user

```
[Logo/Title] [Practice] [Playground] [Contests] [Rankings] [Community] [Languages]    [Sign In] [Sign Up]
```

### Authenticated user (student)

```
[Logo/Title] [Practice] [Playground] [Contests] [Rankings] [Community] [Languages]    [Dashboard v] [Theme] [Locale]
                                                                         └─ My Submissions
                                                                            My Profile
                                                                            Sign Out
```

### Authenticated user (instructor+)

```
[Logo/Title] [Practice] [Playground] [Contests] [Rankings] [Community] [Languages]    [Dashboard v] [Theme] [Locale]
                                                                         └─ Dashboard
                                                                            Problems
                                                                            Groups
                                                                            Submissions
                                                                            Profile
                                                                            Sign Out
```

### Authenticated user (admin)

Same as instructor, with additional "Admin" dropdown entry that navigates to `/dashboard/admin`.

---

## Phased Migration Plan

### Phase 1 — Eliminate (workspace) route group (Low risk)

**Goal:** Remove the `(workspace)` group entirely; redirect its routes.

1. Move `/workspace/discussions` functionality into `/community` as a "My Discussions" filter tab.
2. Update `PublicHeader` nav items: rename "Workspace" action to "Dashboard" and point to `/dashboard`.
3. Remove `src/app/(workspace)/layout.tsx`, `src/app/(workspace)/workspace/page.tsx`, `src/app/(workspace)/workspace/discussions/page.tsx`.
4. Remove `WorkspaceNav` component.
5. Add redirect routes: `/workspace` -> `/dashboard`, `/workspace/discussions` -> `/community?filter=mine`.
6. Remove `workspaceShell` i18n keys (merge any unique ones into `publicShell` or `community`).
7. Update `src/middleware.ts` if it has workspace-specific redirects.

**Estimated files changed:** ~10-12

### Phase 2 — Unify navigation into PublicHeader (Medium risk)

**Status:** COMPLETE

**Goal:** Replace the dual PublicHeader/Dashboard sidebar with a single top navbar that adapts by role.

1. ~~Extend `PublicHeader` to accept optional `session` and `capabilities` props.~~ DONE
2. ~~When authenticated, add a "Dashboard" dropdown menu with role-appropriate links (Problems, Groups, Submissions, Profile, Admin).~~ DONE
3. ~~The dropdown replaces the current "Workspace" action link.~~ DONE
4. Keep `(dashboard)` route group and its `AppSidebar` for now — Phase 2 only changes the top nav on public pages.
5. ~~Add a "back to public site" link in the `(dashboard)` layout header.~~ DONE (commit 2bfcbb89)

**Phase 2 bug fixes completed:**
- ~~The `DropdownItem` type has `adminOnly` and `instructorOnly` flags that are dead code~~ DONE (commit 84580d50 — removed dead flags)
- ~~Mobile menu lacks visual grouping for authenticated navigation items~~ DONE (commit 84580d50 — added "Dashboard" heading and sign-out separator)

**Estimated files changed:** ~5-8

### Phase 3 — Dashboard layout refinement (Medium risk)

**Status:** IN PROGRESS (cycle 13)

**Goal:** Simplify the dashboard layout to complement the top navbar.

1. ~~Ensure the top navbar is visible on dashboard pages (currently it is not — dashboard has its own header).~~ DONE (commit bbf36ec2 — PublicHeader added to dashboard layout)
2. ~~Consider converting `AppSidebar` from a full sidebar to a slimmer icon rail or contextual sub-navigation within each section.~~ PARTIALLY DONE (cycle 13 — removed duplicate items from AppSidebar that are already in PublicHeader dropdown; remaining items: problems, submissions, contests, compiler, rankings, groups, problem sets, admin)
3. Move breadcrumb to top navbar area.
4. Evaluate whether `(control)` route group should merge into `(dashboard)/admin` or remain separate.

**Additional Phase 3 improvements identified in cycle 10 review:**
- ~~Refactor `PublicHeader.getDropdownItems()` to use capability-based filtering instead of hardcoded role checks (AGG-4)~~ DONE (commit 3a2b56d7)
- ~~Remove `tracking-tight` from site title if locale is Korean (CLAUDE.md compliance).~~ DONE (commit 79204982)

**Cycle 13 improvements:**
- ~~Fix dashboard layout i18n namespace — nav items were using common.practice which doesn't exist~~ DONE (commit 4389523c — dashboard now uses publicShell.nav namespace)
- ~~Extract shared navigation config (getPublicNavItems/getPublicNavActions)~~ DONE (commit 4389523c — both layouts use shared helper)
- ~~Remove hardcoded role fallback in getDropdownItems~~ DONE (commit cb2ec48c — capability-based filtering only)
- ~~Remove duplicate AppSidebar items already in PublicHeader dropdown~~ DONE (commit 9bba87d3 — dashboard, profile removed from sidebar)

**Cycle 14 improvements:**
- Add "contests" to PublicHeader dropdown (navigation gap — students need an extra click to reach contests from public pages)

**Remaining Phase 3 work:**
- Further slim down `AppSidebar` to icon-only mode or contextual sub-navigation
- Move breadcrumb to top navbar area
- Evaluate `(control)` route group merge into `(dashboard)/admin`

**Estimated files changed:** ~15-20

### Phase 4 — Route consolidation (Higher risk, defer)

**Goal:** Merge duplicate routes (dashboard rankings -> public rankings, dashboard languages -> public languages, etc.).

1. Make public pages auth-aware: render additional sections or edit buttons when the user is authenticated and has the right capabilities.
2. Redirect dashboard duplicate routes to their public counterparts with a query param or client-side state to show the authenticated view.
3. Remove redundant page components under `(dashboard)`.

**Estimated files changed:** ~20-30

---

## Open Questions

1. **Should the admin panel keep its sidebar layout?** The admin section has 8+ sub-pages. A top navbar may not have enough room. Recommendation: keep sidebar for admin, but nest it under the unified top navbar.

2. **Mobile navigation strategy.** The current `PublicHeader` likely uses a hamburger menu on mobile. Adding authenticated dropdown items needs to be tested for mobile UX. Consider a mobile drawer.

3. **Lecture mode integration.** The dashboard layout includes `LectureModeProvider`, `LectureModeToggle`, and `LectureToolbar`. These must survive the layout migration. Recommendation: move lecture mode into the `(dashboard)` layout at the page level rather than the root layout.

4. **Chat widget.** `ChatWidgetLoader` is rendered in the dashboard layout. Must be preserved after migration. Can be moved to a root layout or rendered per-page.

5. **Breadcrumb placement.** Currently inside `(dashboard)` layout. After migration, should it be in the top navbar or remain in-page?

6. **SEO impact.** Public pages have `generateMetadata` with SEO-optimized titles. Authenticated dashboard pages use `NO_INDEX_METADATA`. This distinction must be preserved — public pages stay indexed, dashboard pages stay noindex.

---

## Prerequisites

- [ ] Mobile UX audit of proposed top navbar with dropdowns
- [ ] Design mockup or Figma for the unified nav (authenticated + unauthenticated)
- [ ] Review of `AppSidebar` capabilities-based rendering logic to ensure nothing is lost
- [ ] i18n audit: `workspaceShell.*` keys must be migrated before removing the layout

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Breaking auth-gated page access | Medium | High | Thorough capability-based testing per role |
| Mobile nav overflow with many items | Medium | Medium | Dedicated mobile drawer design |
| Lecture mode regression | Low | High | Move lecture providers into dashboard layout before removing workspace layout |
| SEO regression on public pages | Low | High | Verify `generateMetadata` and `NO_INDEX_METADATA` still apply correctly |
| Lost i18n keys during migration | Medium | Low | Audit `workspaceShell` keys before deletion |

## Estimated Total Effort

- Phase 1: 1-2 hours
- Phase 2: 2-3 hours
- Phase 3: 3-4 hours
- Phase 4: 4-6 hours
- **Total: 10-15 hours** (spread across multiple cycles)
