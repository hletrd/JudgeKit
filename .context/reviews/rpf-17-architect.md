# RPF Cycle 17 — Architect Report

**Date:** 2026-04-20
**Reviewer:** architect
**Base commit:** HEAD (2af713d3)

---

## ARCH-1: Inconsistent datetime formatting across codebase — no shared client-side timezone context [MEDIUM/HIGH]

**Files:** Multiple (see code-reviewer CR-2 through CR-7)
**Description:** The codebase has a `formatDateTimeInTimeZone` utility in `src/lib/datetime.ts` that properly applies the system-configured timezone, but 7+ components bypass it and use raw `toLocaleString(locale)` / `toLocaleDateString(locale)` / `toLocaleTimeString(locale)` without specifying `timeZone`. This is an architectural consistency issue: there is no shared client-side mechanism for propagating the system timezone to components.

Server components can call `getResolvedSystemTimeZone()` and pass the result down, but client components don't have easy access to the system timezone. The client-side `formatDateTimeInTimeZone` function requires the caller to pass `timeZone` explicitly, which means every client component that formats dates needs the timezone as a prop or from context.

**Architectural recommendation:** Create a client-side timezone context (e.g., `SystemTimezoneProvider`) that makes the system timezone available to all client components. Then replace all raw `toLocaleString` calls with `formatDateTimeInTimeZone` or `formatDateInTimeZone` that reads from this context.

**Fix:**
1. Create `src/contexts/timezone-context.tsx` with a `SystemTimezoneProvider` that provides the system timezone via React context.
2. Wrap the app layout with `SystemTimezoneProvider`.
3. Create a `useSystemTimezone()` hook for client components.
4. Migrate all raw `toLocaleString`/`toLocaleDateString`/`toLocaleTimeString` calls to use the shared utility with the system timezone.

**Confidence:** HIGH

---

## ARCH-2: PublicHeader dropdown and AppSidebar have duplicated navigation definitions [LOW/MEDIUM]

**Files:**
- `src/lib/navigation/public-nav.ts:59-68` (DROPDOWN_ITEM_DEFINITIONS)
- `src/components/layout/app-sidebar.tsx:56-124` (navGroups, adminGroups)

**Description:** The PublicHeader dropdown items and the AppSidebar navigation items are defined separately in different files. When a new navigation item is added, both must be updated. The dropdown already has some items that the sidebar doesn't (e.g., "Problem Sets") and vice versa. This is intentional (the sidebar shows more items than the dropdown), but the capability checks must stay aligned. The JSDoc comments on both sides reference each other, which helps, but there's no compile-time enforcement.

**Fix:** Consider extracting a shared navigation configuration that both the dropdown and sidebar consume, with each filtering/presenting differently. This is a low-priority refactoring since the current system works and the JSDoc cross-references help prevent drift.
**Confidence:** MEDIUM

---

## ARCH-3: Workspace-to-public migration Phase 4 remaining: AppSidebar still has items that duplicate PublicHeader dropdown [LOW/MEDIUM]

**Files:**
- `src/components/layout/app-sidebar.tsx:62-77` (Learning group: Problems, Submissions, Compiler)
- `src/lib/navigation/public-nav.ts:59-68` (DROPDOWN_ITEM_DEFINITIONS)

**Description:** The AppSidebar "Learning" group still shows Problems, Submissions, and Compiler. These all have counterparts in the PublicHeader dropdown (Dashboard, My Submissions, Contests). The Phase 4 plan calls for "removing redundant page components under `(dashboard)` where public counterparts exist" and "further slimming down AppSidebar to icon-only mode or contextual sub-navigation." The sidebar comments say "Contests and Rankings are available in the PublicHeader dropdown, so they are omitted from the sidebar to reduce navigation overlap" — but Problems and Submissions are still in both places.

**Fix:** Per the migration plan, continue Phase 4 by removing Problems and Submissions from the AppSidebar (they are in the PublicHeader dropdown). Keep the sidebar focused on items that don't have public counterparts (Groups) and admin items.
**Confidence:** MEDIUM
