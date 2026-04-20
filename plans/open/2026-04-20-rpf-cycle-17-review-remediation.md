# RPF Cycle 17 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/rpf-17-aggregate.md`

---

## Scope

This cycle addresses the new RPF cycle-17 findings from the multi-agent review:
- AGG-1: Inconsistent client-side datetime formatting — 7+ components bypass timezone-aware utility
- AGG-2: Workers page `formatRelativeTime` uses hardcoded English instead of locale-aware utility
- AGG-3: `access-code-manager.tsx` uses native `confirm()` for destructive action
- AGG-4: Public problem detail page makes 7+ sequential DB queries
- AGG-5: `generateMetadata` and page component fetch problem data with different column selections
- AGG-6: Workers page polls every 10 seconds unconditionally
- AGG-7: PublicHeader mobile menu sign-out button lacks keyboard focus indicator
- AGG-8: `formatNumber` in submission-status-badge hardcodes "en-US" locale
- AGG-9: AppSidebar still has items that duplicate PublicHeader dropdown

No RPF cycle-17 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Create SystemTimezoneProvider and migrate client-side datetime formatting (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:**
  - `src/components/contest/participant-anti-cheat-timeline.tsx:150`
  - `src/components/contest/anti-cheat-dashboard.tsx:257`
  - `src/components/contest/code-timeline-panel.tsx:76-80`
  - `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:111,155`
  - `src/app/(public)/practice/problems/[id]/page.tsx:555`
  - `src/app/(public)/practice/page.tsx:697`
  - `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:284`
- **Problem:** 7+ components use raw `toLocaleString(locale)` / `toLocaleDateString(locale)` / `toLocaleTimeString(locale)` without specifying `timeZone`, causing timestamps to display in the user's browser timezone instead of the system-configured timezone.
- **Plan:**
  1. Create `src/contexts/timezone-context.tsx` with a `SystemTimezoneProvider` and `useSystemTimezone()` hook.
  2. Wrap the app root layout with `SystemTimezoneProvider`, reading the timezone from `getResolvedSystemTimeZone()`.
  3. Migrate each of the 7+ components to use `formatDateTimeInTimeZone` with the system timezone from context.
  4. For server components (`page.tsx` files), pass `timeZone` as a prop or use `getResolvedSystemTimeZone()` directly since they already have access.
  5. Verify all gates pass.
- **Status:** DONE — commit 21fc9eab

### M1: Replace workers page `formatRelativeTime` with `formatRelativeTimeFromNow` (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:85-95`
- **Problem:** The local `formatRelativeTime` function produces English-only strings. The app has `formatRelativeTimeFromNow()` in `@/lib/datetime` which is locale-aware.
- **Plan:**
  1. Import `formatRelativeTimeFromNow` from `@/lib/datetime`.
  2. Remove the local `formatRelativeTime` function.
  3. Replace usages with `formatRelativeTimeFromNow(dateStr, locale)`.
  4. Verify the workers page displays relative times correctly in both Korean and English.
- **Status:** DONE — commit 4d606172

### M2: Replace `access-code-manager.tsx` `confirm()` with `AlertDialog` (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/contest/access-code-manager.tsx:88`
- **Problem:** `handleRevoke` uses native `confirm()` dialog which is inconsistent with the rest of the app and has poor accessibility.
- **Plan:**
  1. Add state for the revoke confirmation dialog (`revokeConfirmOpen`).
  2. Replace `confirm()` with an `AlertDialog` component matching the pattern in `recruiting-invitations-panel.tsx`.
  3. Verify the dialog opens and closes correctly, and the revoke action still works.
- **Status:** DONE — commit 39fa5456

### M3: Parallelize public problem detail page DB queries (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(public)/practice/problems/[id]/page.tsx:99-214`
- **Problem:** After the problem lookup, 7+ independent DB queries run sequentially.
- **Plan:**
  1. After the problem lookup (line 112) and early-return checks, group the independent queries into `Promise.all` calls:
     - Group 1: `getResolvedSystemTimeZone`, `getResolvedSystemSettings`, `languageConfigs` query, `listProblemDiscussionThreads`, `listProblemSolutionThreads`, `listProblemEditorials`, stats query
     - Group 2 (conditional): similar problems, prev/next problem, user submissions
  2. Verify the page renders correctly with no regressions.
- **Status:** DONE — commit 07c1c854

### L1: Add keyboard focus indicator to PublicHeader mobile sign-out button (AGG-7)

- **Source:** AGG-7
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/layout/public-header.tsx:318-325`
- **Problem:** Mobile sign-out button is missing `focus-visible` ring styles that navigation links have.
- **Plan:**
  1. Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` to the sign-out button className.
- **Status:** DONE — commit a5dd6157

---

## Deferred items

### DEFER-1: Align `generateMetadata` and page component column selections for React.cache deduplication (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/app/(public)/practice/problems/[id]/page.tsx:40,112`
- **Reason for deferral:** The metadata query intentionally selects fewer columns for performance (metadata only needs title, description, visibility, and tag data). Forcing the metadata query to select all columns would make the metadata generation slower just to enable deduplication. The alternative of creating a shared cached lookup adds complexity. The current two-query approach is correct and the performance impact is small (one extra DB query per page load).
- **Exit criterion:** When profiling shows the duplicate problem query is a measurable bottleneck, or when a shared cached lookup pattern is established for other pages.

### DEFER-2: Pause workers page polling when tab is backgrounded (AGG-6)

- **Source:** AGG-6
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:254`
- **Reason for deferral:** The workers page is an admin-only page that is rarely left open in a background tab. The 10-second polling interval is reasonable for monitoring. Adding visibility-based pause adds complexity for minimal benefit.
- **Exit criterion:** When admin users report unnecessary network traffic from backgrounded tabs, or when the polling pattern is standardized across all auto-refresh components.

### DEFER-3: `formatNumber` in submission-status-badge locale awareness (AGG-8)

- **Source:** AGG-8
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/submission-status-badge.tsx:44-46`
- **Reason for deferral:** The `toLocaleString("en-US")` is used for technical numeric formatting (execution time in ms, memory in KB) where the "1,234" format is universally understood. Changing this to locale-specific formatting (e.g., "1.234" in German) could cause confusion for technical data. Very low impact.
- **Exit criterion:** When users report confusion with numeric formatting in the submission status badge, or when a decision is made to localize all numeric formatting.

### DEFER-4: Remove duplicate AppSidebar items (AGG-9 / workspace-to-public migration Phase 4)

- **Source:** AGG-9
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/components/layout/app-sidebar.tsx:62-77`
- **Reason for deferral:** This is tracked in the workspace-to-public migration plan (`plans/open/2026-04-19-workspace-to-public-migration.md`) Phase 4 — "Remove redundant page components under (dashboard) where public counterparts exist." The migration plan already covers this as remaining Phase 4 work. It is architectural and should be done as part of the migration, not as an ad-hoc fix.
- **Exit criterion:** When the workspace-to-public migration Phase 4 is executed for the Problems and Submissions sidebar items.

---

## Progress log

- 2026-04-20: Plan created from RPF cycle-17 aggregate review.
- 2026-04-20: H1 DONE — created SystemTimezoneProvider, wrapped root layout, migrated 7+ components (commit 21fc9eab).
- 2026-04-20: M1 DONE — replaced hardcoded English formatRelativeTime with locale-aware utility (commit 4d606172).
- 2026-04-20: M2 DONE — replaced native confirm() with AlertDialog (commit 39fa5456).
- 2026-04-20: M3 DONE — parallelized DB queries on public problem detail page (commit 07c1c854).
- 2026-04-20: L1 DONE — added focus-visible ring styles to mobile sign-out button (commit a5dd6157).
- 2026-04-20: All gates green (eslint, tsc, vitest 2063/2063, next build). Deploy failed (local docker-compose not found — infrastructure issue, not code).
