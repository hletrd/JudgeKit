# Cycle 23 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/cycle-23-aggregate.md`

---

## Scope

This cycle addresses the new cycle-23 findings from the multi-agent review:
- AGG-1: Control route group should be merged into dashboard (capability gate bug, redundant shell, no discoverability)
- AGG-2: Stale `publicShell.nav.workspace` i18n key is dead code
- AGG-3: Control layout nav items are not filtered by user capabilities
- AGG-4: Migration plan needs updating -- Phase 4 is now active
- AGG-5: `PublicHeader.getDropdownItems` uses hardcoded label strings not type-checked against i18n
- AGG-6: `ControlNav` section label uses fixed tracking that violates Korean letter-spacing rule

Plus the user-injected TODO: Continue Phase 4 of workspace-to-public migration: merge control route group into dashboard.

No cycle-23 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Merge control route group into dashboard (AGG-1, AGG-3, AGG-6, user TODO)

- **Source:** AGG-1, AGG-3, AGG-6
- **Severity / confidence:** HIGH / HIGH
- **Citations:** `src/app/(control)/layout.tsx`, `src/app/(control)/control/page.tsx`, `src/app/(control)/control/discussions/page.tsx`, `src/components/layout/control-nav.tsx`
- **Problem:** The `(control)` route group is a redundant shell with no discoverable entry point, a capability gate bug (users with only `community.moderate` cannot access it), nav items not filtered by capabilities, and a different visual paradigm than the dashboard.
- **Plan:**
  1. Create `/dashboard/admin/discussions` page that reuses the discussion moderation content from `/control/discussions`, with its own `community.moderate` capability check.
  2. Add "Discussion Moderation" entry to `AppSidebar` admin section, filtered by `community.moderate` capability.
  3. Add `/control` -> `/dashboard` and `/control/discussions` -> `/dashboard/admin/discussions` redirects in `next.config.ts`.
  4. Migrate `controlShell` i18n keys into `publicShell` and `nav` namespaces (see key mapping below).
  5. Remove `(control)` route group directory: `src/app/(control)/`.
  6. Remove `ControlNav` component: `src/components/layout/control-nav.tsx`.
  7. Remove `controlShell` namespace from both `en.json` and `ko.json`.
  8. Remove `tests/component/control-nav.test.tsx`.
  9. Update `src/proxy.ts` matcher to remove `/control/:path*` and add redirect handling.
  10. Verify all quality gates pass (lint, tsc, build, unit, component).
- **Status:** DONE (commits d3e890df, 03dc313d, 33aef447)

| controlShell key | Destination | New key |
|---|---|---|
| `controlShell.sectionLabel` | DELETE | No longer needed (sidebar removed) |
| `controlShell.title` | DELETE | No longer needed (home card removed) |
| `controlShell.description` | DELETE | No longer needed (home card removed) |
| `controlShell.openLink` | DELETE | No longer needed (home card removed) |
| `controlShell.nav.home` | DELETE | Replaced by existing `nav.dashboard` |
| `controlShell.nav.homeDescription` | DELETE | No longer needed |
| `controlShell.nav.groupsDescription` | DELETE | No longer needed |
| `controlShell.nav.usersDescription` | DELETE | No longer needed |
| `controlShell.nav.languagesDescription` | DELETE | No longer needed |
| `controlShell.nav.settingsDescription` | DELETE | No longer needed |
| `controlShell.nav.discussions` | `nav` | `nav.discussionModeration` |
| `controlShell.nav.discussionsDescription` | `nav` | `nav.discussionModerationDescription` |
| `controlShell.cards.groups` | DELETE | No longer needed (home card removed) |
| `controlShell.cards.users` | DELETE | No longer needed (home card removed) |
| `controlShell.cards.settings` | DELETE | No longer needed (home card removed) |
| `controlShell.cards.discussions` | DELETE | No longer needed (home card removed) |
| `controlShell.moderation.title` | `publicShell` | `publicShell.moderation.title` |
| `controlShell.moderation.description` | `publicShell` | `publicShell.moderation.description` |
| `controlShell.moderation.empty` | `publicShell` | `publicShell.moderation.empty` |
| `controlShell.moderation.openThread` | `publicShell` | `publicShell.moderation.openThread` |
| `controlShell.moderation.unknownAuthor` | `publicShell` | `publicShell.moderation.unknownAuthor` |
| `controlShell.moderation.problemMeta` | `publicShell` | `publicShell.moderation.problemMeta` |
| `controlShell.moderation.generalMeta` | `publicShell` | `publicShell.moderation.generalMeta` |
| `controlShell.moderation.scope.all` | `publicShell` | `publicShell.moderation.scope.all` |
| `controlShell.moderation.scope.general` | `publicShell` | `publicShell.moderation.scope.general` |
| `controlShell.moderation.scope.problem` | `publicShell` | `publicShell.moderation.scope.problem` |
| `controlShell.moderation.state.all` | `publicShell` | `publicShell.moderation.state.all` |
| `controlShell.moderation.state.open` | `publicShell` | `publicShell.moderation.state.open` |
| `controlShell.moderation.state.locked` | `publicShell` | `publicShell.moderation.state.locked` |
| `controlShell.moderation.state.pinned` | `publicShell` | `publicShell.moderation.state.pinned` |
| `controlShell.community.moderation.lock` | `publicShell` | `publicShell.community.moderation.lock` |
| `controlShell.community.moderation.unlock` | `publicShell` | `publicShell.community.moderation.unlock` |
| `controlShell.community.moderation.pin` | `publicShell` | `publicShell.community.moderation.pin` |
| `controlShell.community.moderation.unpin` | `publicShell` | `publicShell.community.moderation.unpin` |
| `controlShell.community.moderation.deleteThread` | `publicShell` | `publicShell.community.moderation.deleteThread` |
| `controlShell.community.moderation.success` | `publicShell` | `publicShell.community.moderation.success` |
| `controlShell.community.moderation.deleteSuccess` | `publicShell` | `publicShell.community.moderation.deleteSuccess` |

### M1: Remove stale `publicShell.nav.workspace` i18n key (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `messages/en.json:2622`, `messages/ko.json:2622`
- **Problem:** The key `publicShell.nav.workspace` ("Workspace") is dead code -- never referenced by any source code.
- **Plan:**
  1. Remove `"workspace": "Workspace"` from `messages/en.json` under `publicShell.nav`.
  2. Remove `"workspace": "워크스페이스"` from `messages/ko.json` under `publicShell.nav`.
  3. Verify no source references exist.
- **Status:** DONE (commit d3e890df)

### L1: Move dropdown item definitions into shared navigation module (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/layout/public-header.tsx:68-93`, `src/lib/navigation/public-nav.ts`
- **Problem:** Dropdown item labels are hardcoded strings inside `PublicHeader` rather than being in the shared `public-nav.ts` module. This creates potential drift between the header dropdown and `AppSidebar` nav items.
- **Plan:**
  1. Extract `getDropdownItems` from `PublicHeader` into `src/lib/navigation/public-nav.ts`.
  2. Align the dropdown item definitions with `AppSidebar`'s nav structure.
  3. Verify both the desktop dropdown and mobile menu render correctly after the move.
- **Status:** DONE (commit 4bbc65aa)

### M2: Update migration plan to mark Phase 4 as active (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `plans/open/2026-04-19-workspace-to-public-migration.md:228`
- **Problem:** The migration plan labels Phase 4 as "Higher risk, defer" but the user-injected TODO explicitly requests Phase 4 work this cycle. The plan also needs a `controlShell` key migration mapping.
- **Plan:**
  1. Update Phase 4 status from "defer" to "IN PROGRESS (cycle 23)".
  2. Add the control-to-dashboard merge as a specific Phase 4 sub-task.
  3. Note that Phase 4 partially completed in cycle 22 (rankings/languages/compiler routes consolidated).
- **Status:** DONE (commit d439ccb3)

---

## Deferred items

None. Every cycle-23 finding above is planned for implementation in this cycle.

---

## Progress log

- 2026-04-20: Plan created from cycle-23 aggregate review.
- 2026-04-20: H1, M1, L1, M2 all DONE. All cycle-23 findings resolved. Quality gates pass (tsc, lint, build, unit, component).
