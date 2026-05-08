# Designer (UI/UX) Review — Cycle 1

**Focus:** Menu hierarchy, admin navigation, feature discoverability, ease of use.
**Date:** 2026-05-06
**Reviewer:** designer
**Recent context:** Workspace pages migrated from `/dashboard/*` → public root paths
(`/problems`, `/groups`, `/contests`, `/problem-sets`, `/profile`). Only
`/dashboard/admin/*` remains in the dashboard route group. New
`/dashboard/admin` index landing page just added.

---

## D1 [HIGH] Header dropdown duplicates the primary nav and confuses hierarchy

**Files:**
- `src/lib/navigation/public-nav.ts:24-35` (top nav items)
- `src/lib/navigation/public-nav.ts:61-70` (dropdown items)
- `src/components/layout/public-header.tsx:178-195, 207-227`

**Problem:** The header dropdown for an authenticated user contains entries
that almost completely overlap with the primary top nav and confuse the IA:

| Item | Top nav | Dropdown |
|---|---|---|
| Practice (`/practice`) | yes | yes (as "problems") |
| Contests (`/contests`) | yes | yes |
| Submissions (`/submissions`) | yes (all) | yes (`?scope=mine`) |
| Problem Sets | no | yes |
| Groups | no | yes |
| Profile | no | yes |
| Admin | no | yes |
| Dashboard | no | yes |

The dropdown is the *only* surface for Problem Sets, Groups, Profile,
Admin and Dashboard, but those items are interleaved with duplicates of
top-nav items (Practice, Contests, Submissions). Users cannot tell from
the dropdown what's reachable elsewhere vs. only here, and the dropdown
labels don't match the top-nav labels (`nav.practice` "Practice" vs.
`nav.problems` "Problems" pointing to the same `/practice`).

**Failure scenarios:**
- Student opens dropdown, sees "Problems" + "My Submissions" and assumes
  the top nav "Practice" / "Submissions" are something different.
- Instructor cannot find "Problem Sets" without realizing it lives under
  the avatar dropdown — it has no top-nav presence.
- Admin sees both "Submissions" (top nav, all-scope) and
  "My Submissions" (dropdown, `?scope=mine`) and has no signal which is
  which.

**Confidence:** HIGH

**Fix:**
- Remove from dropdown anything already in top nav (Practice, Contests,
  Submissions). Keep dropdown strictly for personal/account items
  (Dashboard, Profile, My Submissions, Sign out) plus role-gated entry
  points (Admin landing).
- Promote Groups and Problem Sets either into the top nav (if they're
  primary surfaces for instructors) or into a single grouped dropdown
  section labeled "Manage" with an i18n header. Today's flat list with
  no separators makes it look like duplicates.
- Rename the dropdown label `problems` → use the same `practice` key as
  top nav, or remove it entirely.

---

## D2 [HIGH] Admin landing exposes raw URL paths as primary copy

**File:** `src/app/(dashboard)/dashboard/admin/page.tsx:115-117`

```tsx
<CardContent className="text-xs text-muted-foreground">
  {item.href}
</CardContent>
```

**Problem:** Each admin section card shows `/dashboard/admin/users`,
`/dashboard/admin/plugins/chat-logs`, etc. as the visible card body.
This is internal routing detail leaking to admins as primary content
and:

- Adds visual noise to a card that already has title + description.
- Pretends to be useful info but conveys nothing the description
  doesn't already imply.
- Looks like a placeholder that was never replaced before ship.
- Localization is impossible — slashes and English slugs render the
  same way in `ko` locale.

**Failure scenario:** First-time admin lands on `/dashboard/admin`, sees
14 cards each with a slash-prefixed string, assumes the page is a
debug/dev fixture and bounces.

**Confidence:** HIGH

**Fix:** Drop the `<CardContent>{item.href}</CardContent>` block. The
clickable card + icon + title + i18n description is enough. If a
"power-user" hint is wanted, render the path as a small `<code>` chip
on hover only.

---

## D3 [HIGH] Admin pages have no top-level header — only a SidebarTrigger

**File:** `src/components/layout/conditional-header.tsx:33-41`

```tsx
if (isAdmin) {
  return (
    <header ...>
      <div className="flex items-center gap-2 px-4 py-3">
        <SidebarTrigger />
      </div>
    </header>
  );
}
```

**Problem:** When the path is `/dashboard/admin/*`, the conditional
header renders ONLY a sidebar toggle button — no site title, no theme
toggle, no locale switcher, no user dropdown, no sign-out, no link
home, no breadcrumb. The dashboard layout itself
(`src/app/(dashboard)/layout.tsx:49-59`) renders `PublicHeader` with all
the chrome, but `ConditionalHeader` is not used in that layout — it's
used elsewhere and produces a degraded admin chrome inconsistent with
the rest of the app.

**Failure scenarios:**
- If `ConditionalHeader` is invoked from a layout above the admin
  routes (or in a future refactor), an admin loses every navigation
  affordance other than the sidebar trigger.
- Even today, `ConditionalHeader` is dead/half-dead code — confusing
  for anyone modifying the header.

**Confidence:** HIGH (code is shipped; behavior depends on routing).

**Fix:** Either delete `ConditionalHeader` if `(dashboard)/layout.tsx`
already provides the full `PublicHeader`, or have it wrap `PublicHeader`
with `leadingSlot={<SidebarTrigger />}` and never strip the chrome.

---

## D4 [HIGH] Admin "Quick Actions" card is a flat wall of 11 unranked buttons

**File:** `src/app/(public)/dashboard/_components/admin-dashboard.tsx:24-90`

**Problem:** The dashboard's `AdminDashboard` component renders up to 11
identical `outline` buttons in a flex-wrap, with no grouping, no
hierarchy, no priority. Every admin link is repeated again under the
same titles on `/dashboard/admin` (which has nice grouping). So:

- Two surfaces show overlapping admin navigation in completely different
  styles (chips vs. cards).
- The chip list has no visual ranking — everything looks equally
  important.
- Cognitive load: the admin must scan an unsorted list every time
  they hit `/dashboard`.

**Failure scenario:** Admin types `/dashboard`, sees 11 chips, has to
read each label. Hits `/dashboard/admin`, sees the same 14 cards in two
labelled groups. Ends up bookmarking deep paths to escape both surfaces.

**Confidence:** HIGH

**Fix:** Either
- Reduce the dashboard "quick actions" to 3–5 *truly* high-frequency
  items (Users, Workers, System Settings) and add a
  `View all admin tools →` link to `/dashboard/admin`; OR
- Replace it with a one-line CTA "Open the admin console" linking to
  `/dashboard/admin` and let the admin landing be the canonical
  surface.

---

## D5 [HIGH] Capability gaps between sidebar, dropdown, and admin landing

**Files:**
- `src/lib/navigation/public-nav.ts:64` (`problemSets` requires `problem_sets.create`)
- `src/components/layout/app-sidebar.tsx:65-84`
- `src/app/(dashboard)/dashboard/admin/page.tsx:44-62`

**Problem:** Three independent capability tables exist:

1. Header dropdown (`DROPDOWN_ITEM_DEFINITIONS`).
2. Admin sidebar (`adminGroups`).
3. Admin landing (`ADMIN_GROUPS`).

They duplicate the same `capability` strings and risk drifting. Today's
visible drift:

- Header dropdown gates "Problem Sets" on `problem_sets.create` — so
  students who can attempt assignments but not create sets see no link.
  But `/problem-sets` itself is reachable for any logged-in user
  (the `problem-sets/page.tsx` lives under `(public)`), and the page
  shows assignments in addition to created sets. Capability mismatch
  hides a feature from the very users it's designed for.
- Admin landing exposes `chat-logs` under `system.chat_logs` while the
  sidebar uses the same. But the dashboard quick-actions block also
  uses `system.chat_logs` — three places to keep in sync.

**Confidence:** MEDIUM-HIGH (definitively a maintainability problem;
user-facing impact depends on capability assignments).

**Fix:**
- Extract a single `ADMIN_NAV` source-of-truth module with `{ href,
  titleKey, descriptionKey, capability, group }` and consume it from
  `app-sidebar.tsx`, `dashboard/admin/page.tsx`, and the dashboard
  `admin-dashboard.tsx` quick actions.
- Reconsider the `problem_sets.create` gate on the dropdown entry — gate
  on `problem_sets.view` (or no gate) so participants can navigate.

---

## D6 [MEDIUM] Top nav has no entry to /problem-sets, /groups, /profile, /dashboard

**File:** `src/lib/navigation/public-nav.ts:24-35`

**Problem:** The user complained "many features are not properly
accessible". A logged-in instructor can only reach `/problem-sets`,
`/groups`, `/profile`, and `/dashboard` through the avatar dropdown.
There is no top-nav entry. On mobile (where the dropdown collapses
into the bottom of the sheet), they're triple-buried: hamburger → main
nav → scroll past primary items → dropdown section.

**Failure scenario:** New instructor cannot find Problem Sets or Groups
because they're scanning the visible top nav and never opens the avatar
menu.

**Confidence:** MEDIUM

**Fix:** Either
- Add `/groups` and `/problem-sets` as conditional top-nav items (gated
  on capability) for users who can use them, OR
- Add a visible "Workspace" or "My" submenu in the top nav that groups
  Dashboard / Profile / Groups / Problem Sets / Submissions and reduce
  the avatar dropdown to {Profile, Sign out, Admin}.

---

## D7 [MEDIUM] Breadcrumb home always points to `/dashboard` for everyone

**File:** `src/components/layout/breadcrumb.tsx:96-101`

```tsx
<Link href="/dashboard" ...>
  <Home ... />
</Link>
```

**Problem:** The breadcrumb's home icon goes to `/dashboard`, but the
site header logo goes to `/`. Two "home" affordances, two destinations.
Anonymous users on a public page would never see breadcrumb home (it
short-circuits at `segments.length === 0`), but a logged-in user reading
a contest detail will see Home → contests → ... and clicking Home will
unexpectedly leave the contest area for the dashboard.

**Confidence:** MEDIUM

**Fix:** Make Home point to `/` (matching the logo) for consistency, or
introduce a separate "Dashboard" crumb when on dashboard routes.

---

## D8 [MEDIUM] Sidebar-only-for-admin creates inconsistent layout shifts

**File:** `src/components/layout/app-sidebar.tsx:155-163`

**Problem:** `AppSidebar` returns `null` when the user has no admin
capabilities. The dashboard layout still renders a `SidebarTrigger`
slot conditionally via `hasAdminCapabilities` — but when an instructor
gains the `assignments.view_status` capability and not full admin caps,
they may land in a state where the sidebar returns null but the
breadcrumb header takes a slot in the layout. The user sees a header
that's centered on `max-w-6xl` but no sidebar in the gutter — a
mismatched visual hierarchy.

**Confidence:** MEDIUM

**Fix:** Move the `hasAdminCapabilities` check up to the layout so the
sidebar slot, the trigger, and the page max-width are all consistent.

---

## D9 [MEDIUM] Admin "Quick Actions" dashboard chips show even when section is empty

**File:** `src/app/(public)/dashboard/_components/admin-dashboard.tsx:28`

**Problem:** The `<CardContent>` is `flex flex-wrap`. If the admin has
zero of the gated capabilities (e.g. `system.settings` only), the card
still renders with a heading "Admin Quick Actions" and an empty body.
There's no `if (anyButton) ...` guard.

**Confidence:** MEDIUM

**Fix:** Compute the list eagerly; render the card only if at least one
chip will appear.

---

## D10 [MEDIUM] No "Admin" entry-point chrome on `/dashboard` for admins

**File:** `src/app/(public)/dashboard/page.tsx`

**Problem:** When an admin logs in and lands on `/dashboard`, the page
mounts `AdminDashboard` (chips). But there is no prominent
"Open Admin Console" button leading to `/dashboard/admin` — the new
landing page the user just added is undiscoverable from the dashboard.
Admins have to know that the dropdown's "Admin" item leads there.

**Confidence:** MEDIUM

**Fix:** Add a clearly labeled primary CTA at the top of `AdminDashboard`
linking to `/dashboard/admin` — that's the canonical admin index now.

---

## D11 [LOW] Dropdown items use icon literals coupled by string href

**File:** `src/components/layout/public-header.tsx:57-66`

**Problem:** `DROPDOWN_ICONS` is keyed on the literal `href` string
(including the `?scope=mine` query). Add a search query, the icon
silently drops. The comment in `public-nav.ts` even calls this out as
fragile.

**Fix:** Move icon onto the `DROPDOWN_ITEM_DEFINITIONS` itself (or key
DROPDOWN_ICONS by `label`).

---

## D12 [LOW] Nav i18n key `nav.problems` and `nav.practice` both exist for the same destination

**Files:** `messages/en.json` `nav.problems` "Problems" + `nav.practice` "Practice".

**Problem:** Two strings, two translations, one URL. When translators
update one, the other drifts. Korean users will see two different labels
for the same destination depending on which surface they're on.

**Fix:** Pick one canonical key, drop the other.

---

## D13 [LOW] Admin sidebar group ordering is arbitrary

**File:** `src/components/layout/app-sidebar.tsx:61-86`

**Problem:** Admin groups are "Users & Logs" then "System". `Plugins`
sits in System but `Discussion Moderation` sits in Users & Logs.
Settings is below `tagManagement`. There's no clear hierarchy
(audit/safety vs. configuration vs. content).

**Fix:** Re-group as e.g. {Identity & Access, Content & Moderation,
Observability, Configuration} or keep current grouping but order items
by frequency-of-use within each group.

---

## D14 [LOW] No mobile drawer/affordance for the admin sidebar

**Note:** The admin sidebar is the only surface for many admin features
on desktop, and the desktop top nav has no admin-section links. On
mobile, where the sidebar collapses behind a SidebarTrigger, the
trigger is the *only* affordance — but the trigger is rendered only
when `hasAdminCapabilities` is true. If the layout's
`leadingSlot={hasAdminCapabilities ? <SidebarTrigger /> : undefined}`
fails (capability resolution race during session boot), an admin loses
mobile sidebar access entirely.

**Fix:** Make the sidebar trigger render unconditionally when the route
is under `/dashboard/admin/*`, defaulting to closed if no items.

---

## D15 [LOW] Admin landing path-strings break the `text-xs` rhythm in Korean

**File:** `src/app/(dashboard)/dashboard/admin/page.tsx:115-117`

The path-string in `<CardContent>` uses `text-xs` which is fine for
Latin slashes but visually awkward next to the Korean title.
Removing the path strings (D2) also fixes this.

---

## Cross-system observations

- The migration from `/dashboard/*` to public root paths is consistent
  in `public-nav.ts`, but the avatar dropdown labels still read
  "Dashboard" pointing to `/dashboard`. With most workspace pages now
  outside `/dashboard`, the label "Dashboard" is misleading; for a
  student it's now an empty/redundant route.
- `instructor-dashboard.tsx:126` still links to
  `/dashboard/admin/submissions` — that path is admin-only, but an
  instructor without `submissions.view_all` will hit a redirect/403.
- `Breadcrumb` segment map only knows about a fixed set of segments;
  unknown segments fall back to title-cased slugs. Path
  `/dashboard/admin/api-keys` becomes `Api Keys` — should map to
  `apiKeys` i18n key.

---

## Final confidence ranking

| ID | Severity | Confidence |
|---|---|---|
| D1 dropdown duplicates top nav | HIGH | HIGH |
| D2 admin landing shows raw URLs | HIGH | HIGH |
| D3 admin header strips chrome | HIGH | HIGH |
| D4 dashboard chips wall | HIGH | HIGH |
| D5 capability tables drift | HIGH | MED-HIGH |
| D6 features only in dropdown | MEDIUM | MEDIUM |
| D7 breadcrumb home → /dashboard | MEDIUM | MEDIUM |
| D8 sidebar slot inconsistency | MEDIUM | MEDIUM |
| D9 empty quick-actions card | MEDIUM | MEDIUM |
| D10 no admin-console CTA | MEDIUM | MEDIUM |
| D11 dropdown icon coupling | LOW | HIGH |
| D12 problems/practice key drift | LOW | HIGH |
| D13 sidebar group order | LOW | MEDIUM |
| D14 mobile sidebar fragility | LOW | MEDIUM |
| D15 Korean path-string rhythm | LOW | LOW |
