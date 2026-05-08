# Cycle 2/3 — Designer Review (UX / IA)

**HEAD:** main / 2198a39b
**Scope:** continue cycle 1 IA cleanup (menu hierarchy, admin discoverability), broaden lens to other findings.
**Method:** static review of nav/layout source against deployed `https://test.worv.ai` (cycle 1 commits not yet deployed there). Compared on-disk state vs. live IA.

---

## NEW FINDINGS — CYCLE 2

### D2-01 — `AppSidebar` is dead code (never mounted) — HIGH / HIGH
**File:** `src/components/layout/app-sidebar.tsx` (entire file, 250 lines).
**Evidence:** `rg "AppSidebar|<SidebarProvider" src/app/` returns ZERO production mount points. Only test file `tests/component/app-sidebar.test.tsx` and a documentation reference in `src/lib/auth/sign-out.ts` mention it. `(dashboard)/layout.tsx` uses `PublicHeader` directly with no sidebar. `(public)/layout.tsx` likewise.
**Why it matters (UX):** The user reported "many features hard to access". The cycle-1 plan and review described AppSidebar as the primary admin navigation surface, but it is in fact entirely orphaned — admin users get NO secondary navigation at all on `/dashboard/admin/*` pages other than the global top nav (which contains zero admin items) and the breadcrumb. To go from `/dashboard/admin/users` to `/dashboard/admin/workers` an admin must (a) hit the top-nav avatar dropdown → "Administration" to land on `/dashboard/admin`, (b) re-find the worker card, (c) click. There is no persistent admin navigator.
**Fail mode:** Severe loss of admin productivity; explains user's "menu hierarchy confusing" complaint at the deepest level.
**Fix:** Choose ONE of:
  (1) Delete `app-sidebar.tsx`, the `ActiveTimedAssignmentSidebarPanel` (only sidebar consumer), and the test, and accept that admin nav is the landing-page card grid only. Add a sticky **"Admin section switcher"** (a small horizontal tab or compact secondary nav) to the chrome of `/dashboard/admin/*` pages so users can switch sections without bouncing through the landing page.
  (2) Re-mount `AppSidebar` inside `(dashboard)/layout.tsx` via `SidebarProvider`, gated to admin-cap users. This restores cycle-1's stated mental model.
  Recommended: **(1)** — sidebar UX competes with top nav and was the source of the original "two homes" complaint. A compact horizontal tab nav at the top of admin pages is lighter and discoverable.
**Confidence:** HIGH.

### D2-02 — `ConditionalHeader` is dead code with stale test — MEDIUM / HIGH
**File:** `src/components/layout/conditional-header.tsx`, `tests/component/conditional-header.test.tsx`.
**Evidence:** No production references — `(dashboard)/layout.tsx` and `(public)/layout.tsx` both use `PublicHeader` directly. `ConditionalHeader` was the cycle-1 culprit for "stripping chrome on /dashboard/admin/*" (D3, deferred to cycle 2/3 as B2). Investigation confirms the component is unreachable today.
**Fail mode:** Dead code drift; confuses future readers; tests still assert behavior that no user ever sees.
**Fix:** Delete `src/components/layout/conditional-header.tsx` and `tests/component/conditional-header.test.tsx`.
**Confidence:** HIGH (resolves cycle-1 finding D3/B2).

### D2-03 — Three duplicate admin-nav data tables still drift — HIGH / HIGH
**Files:**
- `src/components/layout/app-sidebar.tsx` (lines 61–86) — `adminGroups: NavGroup[]` (dead but still maintained)
- `src/app/(dashboard)/dashboard/admin/page.tsx` (lines 40–65) — `ADMIN_GROUPS: AdminGroup[]`
- `src/app/(public)/dashboard/_components/admin-dashboard.tsx` (lines 23–27) — `QUICK_ADMIN_LINKS`
**Evidence:** Cycle 1 D5 / Task A9 was explicitly deferred. A new admin section added today must touch three files; one of them (AppSidebar) is dead so the maintainer will be misled.
**Fix:** Create `src/lib/navigation/admin-nav.ts` exporting `ADMIN_NAV_GROUPS` with `{ href, titleKey, descriptionKey, capability, icon, group }` rows. Make landing, sidebar (if kept) and quick-actions consume it.
**Confidence:** HIGH.

### D2-04 — Admin landing section header uses `tracking-wide` on Korean text — MEDIUM / HIGH
**File:** `src/app/(dashboard)/dashboard/admin/page.tsx:95`
```
<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
```
**Evidence:** Project rule (`CLAUDE.md`): *"Keep Korean text at the browser/font default letter spacing. Do **not** apply custom `letter-spacing` (or `tracking-*` Tailwind utilities) to Korean content."* The `tNav(group.labelKey)` returns "사용자 및 로그" / "시스템" in Korean.
**Fail mode:** Project-rule violation; awkward Korean rendering on the admin landing.
**Fix:** Conditionally apply `tracking-wide` only when locale ≠ "ko" (matching the AppSidebar pattern at `app-sidebar.tsx:207`).
**Confidence:** HIGH.

### D2-05 — Admin landing has no "back to dashboard" / context affordance — MEDIUM / MEDIUM
**File:** `src/app/(dashboard)/dashboard/admin/page.tsx`
**Evidence:** Page renders `<h1>Administration</h1>` and groups, but the breadcrumb (in `(dashboard)/layout.tsx`) provides Home → admin only when JS hydrated. Admin landing has no obvious return path to `/dashboard` (the user dashboard) — the only escape hatch is the top-nav site title or the avatar dropdown's "Dashboard" entry.
**Fail mode:** Reverse-navigation friction; common pattern in admin tools is a header CTA "← Back to dashboard" or breadcrumb prominence.
**Fix:** Either (a) add a `Link` "← Dashboard" above the `<h1>`, OR (b) ensure breadcrumb in `(dashboard)/layout.tsx` is immediately visible without JS hydration race. Recommend (b) for consistency.
**Confidence:** MEDIUM.

### D2-06 — `nav.problems` key still defined but unused outside breadcrumb — LOW / HIGH
**File:** `messages/en.json` line 142 (and `messages/ko.json` analogue).
**Evidence:** Cycle 1 dropped `publicShell.nav.problems` (the duplicate key). The `nav.problems` (root namespace) survives and is only referenced by `breadcrumb.tsx` `SEGMENT_LABEL_MAP["problems"]`. `/problems/*` is a legitimate route, so the key is still needed — but verify no orphaned consumer.
**Fail mode:** None active; record only.
**Fix:** None required; verified retention.
**Confidence:** HIGH (no action).

### D2-07 — Pre-existing test gates failing since pre-cycle-1 (per cycle-1 plan) — MEDIUM / HIGH
**Files:**
- `tests/unit/custom-role-pages-implementation.test.ts`
- `tests/unit/platform-mode-ui-implementation.test.ts`
- `tests/unit/security/rate-limit.test.ts`
**Evidence:** Cycle-1 plan §"DEFERRED GATE FAILURES" lists these as pre-existing. Cycle 2 should fix at least the first two (test asserts old contract that has shifted; rewrite to match the post-migration shape).
**Fail mode:** Quality-gate noise hides real regressions.
**Fix:**
  - `custom-role-pages-implementation.test.ts` — assert the new contract: dropdown shows admin entry behind `system.settings`, sidebar removed.
  - `platform-mode-ui-implementation.test.ts` — re-introduce a `<Badge>` for platform mode in `PublicHeader.trailingSlot` for `/dashboard/*`, and update the test to assert it.
  - `rate-limit.test.ts` — out of IA scope; defer to dedicated security cycle.
**Confidence:** HIGH for first two; rate-limit MEDIUM.

### D2-08 — Top-nav still has no entry to `/groups`, `/problem-sets` for capable users — MEDIUM / MEDIUM
**File:** `src/lib/navigation/public-nav.ts` `getPublicNavItems()`.
**Evidence:** Cycle 1 B1 explicitly deferred. After cycle 1's dropdown dedupe, these items now ONLY live in the avatar dropdown. The user complaint *"many features hard to access"* covers this exactly: a logged-in instructor's primary work (groups, assignments) is now buried 2 clicks deep behind the avatar.
**Fail mode:** Friction for non-admin authenticated users (instructors, group leaders).
**Fix:** Add capability-aware top-nav entries:
  - "Groups" if user has `groups.view_all` OR is in any group (server check).
  - "Problem Sets" if user has `problem_sets.view`.
  Take a `capabilities?: string[]` arg in `getPublicNavItems()`.
**Confidence:** MEDIUM.

### D2-09 — `(dashboard)/layout.tsx` does NOT include `<Toaster />` for assignment timer — LOW / MEDIUM (verify)
**File:** `src/app/(dashboard)/layout.tsx` line 70 — Toaster IS included.
**Status:** No issue (verified).

### D2-10 — Admin landing card grid hides `descriptionKey` on small screens — LOW / MEDIUM
**File:** `src/app/(dashboard)/dashboard/admin/page.tsx:104-114`.
**Evidence:** `<CardDescription className="mt-1 text-xs">` is always rendered, but at `sm:grid-cols-2 xl:grid-cols-3` on a phone the description compresses awkwardly. Acceptable today; flag for later refinement.
**Fix:** None required this cycle.
**Confidence:** LOW.

### D2-11 — Dashboard `AdminDashboard` uses `dashboard.adminQuickActions` label, but title now says "Administration" — LOW / HIGH
**File:** `src/app/(public)/dashboard/_components/admin-dashboard.tsx:44-50`.
**Evidence:** The Card title reads "Quick Actions" (`adminQuickActions`) but the CTA button reads "Administration" (`tNav("administration")`). After cycle-1 chip wall removal, only 3 shortcuts remain — labelling them "Quick Actions" is overkill. Consider renaming the card heading to "Admin shortcuts" / "관리자 바로가기" or merging into a single CTA-only card when `visibleQuickLinks.length === 0`.
**Fix:** Rename `adminQuickActions` → `adminShortcuts` in messages, or use `nav.administration` as the card title.
**Confidence:** HIGH (visual confirmation).

---

## CROSS-AGENT AGREEMENT

D2-01 (AppSidebar dead) reinforces cycle-1 D3/B2 (ConditionalHeader / sidebar slot) — both stem from the cycle-29-era workspace→public migration leaving cosmetic shells.
D2-03 reinforces cycle-1 D5/A9 (single source of truth for admin nav) — DEFERRED last cycle, now blocking productivity.

---

## QUALITY GATES (snapshot at HEAD 2198a39b)

- `tsc --noEmit`: PASS (clean — confirmed cycle-2 baseline run).
- `eslint .`: PASS (clean — confirmed cycle-2 baseline run).
- vitest: same pre-existing failures as cycle 1 (3 tests).

---

## SUMMARY

The single biggest UX issue this cycle: **AppSidebar is dead code**. Cycle 1 documented the layout migration but did not delete the orphaned admin sidebar nor consolidate the three duplicated admin-nav tables. Admin users today have NO persistent secondary navigation on admin pages. Recommended cycle-2 path: delete dead code (`AppSidebar`, `ConditionalHeader`), consolidate admin nav into `lib/navigation/admin-nav.ts`, fix Korean letter-spacing on admin landing, fix the two cycle-1 deferred test contracts, and add `/groups` and `/problem-sets` to capability-aware top nav.
