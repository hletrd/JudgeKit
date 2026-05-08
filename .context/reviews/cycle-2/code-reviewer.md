# Cycle 2/3 — Code Reviewer

**HEAD:** main / 2198a39b
**Focus:** code quality, dead code, contract drift after cycle-1 IA migration.

---

## C2-01 — Dead `AppSidebar` component still maintained — HIGH / HIGH
- **File:** `src/components/layout/app-sidebar.tsx`
- **Evidence:** Component is exported but no production mount. `(dashboard)/layout.tsx` does not import it; no `SidebarProvider` is rendered anywhere outside `src/components/ui/sidebar.tsx` itself.
- **Fail mode:** Maintainers add new admin items to the sidebar table thinking it's live; the change is invisible. ~250 LOC dead code.
- **Fix:** Delete the file, plus its tests (`tests/component/app-sidebar.test.tsx`), and detach `ActiveTimedAssignmentSidebarPanel` (its only consumer) — moving the timed-assignment surfacing into the dashboard chrome, OR delete that panel too.
- **Confidence:** HIGH.

## C2-02 — Dead `ConditionalHeader` component — MEDIUM / HIGH
- **File:** `src/components/layout/conditional-header.tsx` + `tests/component/conditional-header.test.tsx`
- **Evidence:** Only test references; no production import.
- **Fix:** Delete both files. Resolves cycle-1 deferred D3/B2.
- **Confidence:** HIGH.

## C2-03 — Triplicate admin nav data — HIGH / HIGH
- **Files:** `app-sidebar.tsx:61-86`, `dashboard/admin/page.tsx:40-65`, `dashboard/_components/admin-dashboard.tsx:23-27`.
- **Fail mode:** Drift; cycle-1 A9 deferred.
- **Fix:** Single `src/lib/navigation/admin-nav.ts` consumed by both surviving consumers (admin landing + quick-shortcuts).
- **Confidence:** HIGH.

## C2-04 — `getPublicNavItems(t)` lacks capability awareness — MEDIUM / HIGH
- **File:** `src/lib/navigation/public-nav.ts:37-48`
- **Evidence:** Cycle-1 B1 deferred. The function takes only `t`; can't surface Groups / Problem Sets for capable users without code changes.
- **Fix:** Accept optional `capabilities?: string[]`; conditionally include `/groups`, `/problem-sets`. Update both layouts to pass `capabilities`.
- **Confidence:** HIGH.

## C2-05 — `ActiveTimedAssignmentSidebarPanel` orphaned — MEDIUM / MEDIUM
- **File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx`
- **Evidence:** Only consumer is the dead `AppSidebar`. If sidebar is removed, this panel disappears with it — meaning timed-assignment "active now" UX is silently lost. Either re-host it in the dashboard chrome or accept removal.
- **Fix:** Move the panel rendering into `(public)/layout.tsx` or `(dashboard)/layout.tsx` chrome (e.g. between header and main content) for users with active timed assignments. If pre-existing tests assert this, update accordingly.
- **Confidence:** MEDIUM.

## C2-06 — `breadcrumb.tsx` Home link still hidden behind `sr-only` — LOW / HIGH
- **File:** `src/components/layout/breadcrumb.tsx:113-114`
- **Evidence:** Home text is `sr-only`; only the `<Home>` icon is visible. Cycle 1 fixed the href to `/`. The icon-only crumb is OK for sighted users but could benefit from an `aria-label` instead of the empty visible text.
- **Fix:** Add `aria-label={tCommon("home")}` to the `<Link href="/">` so screen readers and accessibility tools both report a label. Currently it relies on `sr-only` text inside the link; switch to `aria-label` plus title attribute for tooltip on hover.
- **Confidence:** HIGH (cosmetic accessibility tightening).

## C2-07 — `getDropdownItems()` capabilities arg uses `?? false` for unset cap — LOW / HIGH
- **File:** `src/lib/navigation/public-nav.ts:99-101`
- **Evidence:** When `capabilities` is undefined (not yet resolved), capability-gated items are silently hidden. This means a freshly-loaded admin sees the dropdown without "Admin" until session resolves. In practice the layout server-renders the user with caps, so risk is low — but document this.
- **Fix:** Add a JSDoc note; consider rendering a placeholder "Admin" entry when the user role is `admin`/`super_admin` even before caps resolve, to avoid layout shift.
- **Confidence:** HIGH (note only).

## C2-08 — `dashboard/page.tsx` re-renders `DashboardJudgeSystemSection` for non-admin / non-candidate — LOW / MEDIUM
- **File:** `src/app/(public)/dashboard/page.tsx:113-124`
- **Evidence:** Block at `{!isAdminView && !isCandidateView}` renders `DashboardJudgeSystemSection`; `AdminDashboard` *also* renders it (admin-dashboard.tsx:126). For admin users `isAdminView=true` so the trailing block is skipped — no double render. Verified safe; record for clarity.
- **Confidence:** MEDIUM (no fix).

## C2-09 — `messages/en.json` still has `dashboard.adminQuickActions` after the chip wall is gone — LOW / HIGH
- **File:** `messages/en.json` (search `adminQuickActions`)
- **Evidence:** Cycle 1 reduced quick actions to a CTA + 3 shortcuts. The card title still says "Quick Actions" — visually misleading for what's now an "Administration" entry-point card.
- **Fix:** Rename to `dashboard.adminShortcuts` ("Admin shortcuts" / "관리자 바로가기"), or reuse `nav.administration`.
- **Confidence:** HIGH.

## C2-10 — `tests/unit/custom-role-pages-implementation.test.ts` asserts removed contract — MEDIUM / HIGH
- **File:** test file referenced in cycle-1 plan as Pre-1.
- **Evidence:** Test asserts `(dashboard)/layout.tsx` invokes `capsSet.has("assignments.view_status")` and that `public-nav.ts` declares `capability: "problem_sets.create"` with `label: "problems"`. Both shifted by cycle-1.
- **Fix:** Rewrite to assert the new dropdown contract (`/dashboard`, `/profile`, `/submissions?scope=mine`, `/groups`, `/problem-sets`, `/dashboard/admin` gated by `system.settings`).
- **Confidence:** HIGH.

## C2-11 — `tests/unit/platform-mode-ui-implementation.test.ts` asserts removed sidebar contract — MEDIUM / HIGH
- **File:** test file referenced in cycle-1 plan as Pre-2.
- **Evidence:** Test expects `(dashboard)/layout.tsx` to pass `platformMode={effectivePlatformMode}` to a sidebar that no longer exists in that layout.
- **Fix:** Either re-introduce a platform-mode badge in the chrome (per cycle-1 exit criterion), OR delete the test as stale-by-design and replace with a cap-aware top-nav assertion. Recommend re-introducing the badge as a `<Badge>` slot in `PublicHeader.trailingSlot` for `/dashboard/*` paths, then update the test.
- **Confidence:** HIGH.

---

## SUMMARY

After cycle-1's IA cleanup, the codebase carries two large dead components (`AppSidebar`, `ConditionalHeader`), three duplicated admin-nav tables, two stale unit tests, and a cap-unaware top nav. Highest priority for cycle 2: delete dead code, single-source the admin nav, restore (or remove) the two failing test contracts.
