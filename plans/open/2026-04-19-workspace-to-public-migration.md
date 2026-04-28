# Workspace-to-Public Page Migration Plan

**Date:** 2026-04-19
**Status:** ALL PHASES COMPLETE — ready for archival (cycle 1 RPF orchestrator-driven, 2026-04-29). All 7 phases verified at HEAD `32621804`: `(workspace)` and `(control)` route groups removed; 7 308-redirects in `next.config.ts`; `WorkspaceNav`/`ControlNav`/`workspaceShell`/`controlShell` references purged from `src/`; remaining `(dashboard)` routes match the documented "must stay in authenticated area" list.
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

**Status:** COMPLETE (cycle 1 RPF, 2026-04-29). All sub-items below are DONE or explicitly evaluated-and-deferred-with-reason. Control route merge happened in Phase 4 (cycle 23). Icon-rail mode for admin sidebar evaluated in cycle 27 and deferred — quote: "the current full sidebar provides better usability for 14 admin items. Icon-rail mode would require tooltip-only labels and make the admin section harder to navigate."

**Goal:** Simplify the dashboard layout to complement the top navbar.

1. ~~Ensure the top navbar is visible on dashboard pages (currently it is not — dashboard has its own header).~~ DONE (commit bbf36ec2 — PublicHeader added to dashboard layout)
2. ~~Consider converting `AppSidebar` from a full sidebar to a slimmer icon rail or contextual sub-navigation within each section.~~ PARTIALLY DONE (cycle 13 — removed duplicate items from AppSidebar that are already in PublicHeader dropdown; remaining items: problems, submissions, contests, compiler, rankings, groups, problem sets, admin)
3. Move breadcrumb to top navbar area. **DONE** (commit a06bd712 — moved to sticky header above main content)
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
- ~~Add "contests" to PublicHeader dropdown~~ DONE (already present in `getDropdownItems`)

**Cycle 20 improvements:**
- ~~Remove "submissions" from AppSidebar~~ DONE (commit 73fbe539 — already in PublicHeader dropdown)

**Cycle 15 improvements:**
- Fix `tracking-wide` on PublicHeader mobile menu dashboard label — now conditional, skipped for Korean locale (commit 1416cbce)
- Fix `handleSignOut` in AppSidebar — added try/catch to reset `isSigningOut` on failure (commit 50f84172)

**Remaining Phase 3 work:**
- ~~Further slim down `AppSidebar` to icon-only mode or contextual sub-navigation~~ DONE (cycle 26 — AppSidebar hidden entirely for non-admin users; admin sidebar remains full for admin sections)
- ~~Consider hiding breadcrumb on mobile viewports~~ DONE (already hidden via `hidden md:block`)
- Evaluate `(control)` route group merge into `(dashboard)/admin` — DONE (merged in Phase 4)

**Estimated files changed:** ~15-20

### Phase 4 — Route consolidation and control group merge

**Status:** COMPLETE

**Goal:** Merge duplicate routes (dashboard rankings -> public rankings, dashboard languages -> public languages, etc.) and merge the `(control)` route group into `(dashboard)`.

**Cycle 22 progress (rankings/languages/compiler consolidation):**
- ~~Redirect `/dashboard/rankings` to `/rankings`~~ DONE (commit 662b71ec)
- ~~Redirect `/dashboard/languages` to `/languages`~~ DONE (commit 662b71ec)
- ~~Redirect `/dashboard/compiler` to `/playground`~~ DONE (commit 662b71ec)

**Cycle 23 progress (control group merge + Phase 4 audit):**
- ~~Move `/control/discussions` to `/dashboard/admin/discussions` with `community.moderate` capability check~~ DONE (commit 03dc313d)
- ~~Migrate `controlShell` i18n keys to `publicShell` and `nav` namespaces~~ DONE (commit d3e890df)
- ~~Add `/control` and `/control/discussions` redirects~~ DONE (commit 03dc313d)
- ~~Remove `(control)` route group directory, `ControlNav` component, and `controlShell` namespace~~ DONE (commit 03dc313d)
- ~~Add "Discussion Moderation" to `AppSidebar` admin section~~ DONE (commit 03dc313d)
- ~~Remove stale `publicShell.nav.workspace` i18n key~~ DONE (commit d3e890df)
- ~~Centralize dropdown items in shared nav module~~ DONE (commit 4bbc65aa)

**Phase 4 audit (cycle 23):**
All dashboard routes with public counterparts have been redirected. The remaining dashboard routes are auth-gated or role-gated and must stay:
- `/dashboard` — personal dashboard with role-specific widgets
- `/dashboard/problems` — problem management (write operations, instructor+)
- `/dashboard/contests` — contest list (auth-gated)
- `/dashboard/submissions` — user submission history (auth-gated)
- `/dashboard/groups` — group management (student roster data)
- `/dashboard/problem-sets` — problem set management (instructor+)
- `/dashboard/profile` — personal settings (auth-gated)
- `/dashboard/admin/*` — system administration (admin only)

No redundant page components remain under `(dashboard)`.

**Completed Phase 4 work:**
1. ~~Make public pages auth-aware: render additional sections or edit buttons when the user is authenticated and has the right capabilities.~~ DONE — "Edit Problem" button added to `/practice/problems/[id]` for users with `problems.create` capability (commit 167fa41c); "Problem Sets" added to PublicHeader dropdown for users with `problem_sets.create` capability (cycle 16)
2. ~~Remove redundant page components under `(dashboard)` where public counterparts exist.~~ DONE — all dashboard routes with public counterparts (rankings, languages, compiler) have been redirected; remaining dashboard routes are auth-gated and must stay.

**Estimated files changed:** ~20-30

### Phase 5 — AppSidebar slim-down and non-admin sidebar removal

**Status:** COMPLETE

**Goal:** Remove the AppSidebar for non-admin users since all their navigation items are now in the PublicHeader dropdown. The sidebar remains essential for admin users who need access to 14 admin-specific nav items.

**Cycle 26 progress:**
- ~~Remove capability gates from "Problems" and "Groups" dropdown items so all authenticated users see them~~ DONE (commit cc334546)
- ~~Hide AppSidebar entirely for non-admin users (no admin capabilities)~~ DONE (commit cc334546)
- ~~Remove non-admin nav items from AppSidebar (navGroups constant) since sidebar is hidden for non-admin users~~ DONE (commit 69c5c62b)
- ~~Remove dead code from AppSidebar: hideStandaloneCompiler, playground filter, problem-sets special-case~~ DONE (commit 69c5c62b)
- ~~Remove unused imports (Users, FolderOpen) and getPlatformModePolicy~~ DONE (commit 69c5c62b)
- Both changes align the PublicHeader dropdown with the AppSidebar's visibility behavior, ensuring no nav items are lost during the transition

**Cycle 27 evaluation:**
- Mobile UX audit: Admin sidebar already uses the shadcn/ui Sheet (drawer) component on mobile viewports (below 768px). The `SidebarProvider` context properly switches between desktop sidebar and mobile sheet. No changes needed.
- navGroups cleanup: The `navGroups` constant was already cleaned up in cycle 26 — only `adminGroups` remains with admin-specific items. Non-admin items were removed. No further cleanup needed.
- Icon-rail mode for admin sidebar: Evaluated but deferred — the current full sidebar provides better usability for 14 admin items. Icon-rail mode would require tooltip-only labels and make the admin section harder to navigate. Can be revisited if admin feedback requests it.

**All Phase 5 remaining work is either complete or evaluated and deferred.**

**Estimated files changed:** ~5-10

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
- Phase 5: 2-3 hours
- Phase 6: 3-4 hours
- Phase 7: 6-10 hours
- **Total: 21-32 hours** (spread across multiple cycles)

---

### Phase 6 — More dashboard duplicates → public (DONE)

**Completed in commits 6a24057f, 1808e7b3:**
- Redirect `/dashboard/submissions` → `/submissions?scope=mine`
- Redirect `/dashboard/submissions/[id]` → `/submissions/[id]`
- Redirect `/dashboard/contests/join` → `/contests/join` (page moved to public)
- Redirect `/dashboard/problems/[id]/rankings` → `/practice/problems/[id]/rankings`
- Move `SubmissionDetailClient` and sub-components to `src/components/submissions/` so the public submission page no longer crosses the dashboard route group boundary
- Add `from=admin` handling to public submission detail back-button logic
- Update PublicHeader dropdown — "Problems" → `/practice`, "Contests" → `/contests`, "My Submissions" → `/submissions?scope=mine`
- Add Create Problem + Import Problem buttons to `/practice` for users with `problems.create` (mirrors `/dashboard/problems`)
- Add Create Contest + Join with Code buttons to `/contests` for instructors+ / authenticated users
- Move `ProblemImportButton` to `src/components/problem/` with configurable `redirectBasePath` so both public and dashboard pages reuse the same component
- Update internal links from `/dashboard/submissions/[id]` → `/submissions/[id]` across the codebase
- Restore not-found page in the new public submissions/[id] location

### Phase 7 — Participation flow

**Status:** COMPLETE

Move/merge the contest and problem participation experiences into the public route group with auth-aware rendering:

- ~~`/dashboard/contests/[assignmentId]` student view → `/contests/[id]` participation section (anti-cheat monitor, exam-session start, leaderboard, my submissions)~~ DONE
- ~~`/dashboard/contests/[assignmentId]` instructor view → kept as the management view (status board, anti-cheat dashboard, candidates, invitations) reachable from `/contests/[id]` via a "Manage Contest" button~~ DONE
- ~~`/dashboard/problems/[id]` participant view (with assignmentId) → `/practice/problems/[id]?assignmentId=...` with anti-cheat monitor, lecture mode, edit/delete/export buttons~~ DONE
- ~~Add a "My Contests" tab/section to `/contests` showing private/group contests the user is enrolled in (calls `getContestsForUser`)~~ DONE
- ~~Redirect `/dashboard/problems/[id]` → `/practice/problems/[id]`~~ DONE
- ~~Redirect `/dashboard/contests/[assignmentId]` → `/contests/[assignmentId]` for students~~ DONE

**Implementation details (commits):**
1. `5dffe377` — Data layer: `getUserContestAccess()`, `getEnrolledContestDetail()` in `public-contests.ts`
2. `7ed5fd90` — Move `AssignmentOverview` to shared `@/components/assignment/` with `backHref`/`problemHrefPrefix` props
3. `21671fdd` — Pass `assignmentId` through `PublicQuickSubmit` to `ProblemSubmissionForm`
4. `4df35c7f` — Auth-aware contest detail at `/contests/[id]` (three rendering paths: student/instructor/public)
5. `565d68ad` — Assignment context for problem detail at `/practice/problems/[id]?assignmentId=...`
6. `db9ddbc8` — "My Contests" section on `/contests` page for authenticated users
7. No separate commit needed — link cleanup verified as already correct from Steps 4-6
8. `1ee90015` — Redirect dashboard problem/contest pages to public URLs
