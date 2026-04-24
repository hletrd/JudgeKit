# RPF Cycle 21 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/cycle-21-aggregate.md`
**Status:** All priority items DONE

## Scope

This cycle addresses the new cycle-21 findings from the multi-agent review:
- AGG-1: Raw `fetch()` calls in admin components bypass centralized `apiClient`
- AGG-2: `language-config-table.tsx` `fetchImageStatus` silently swallows errors and has no loading state
- AGG-3: Disk usage bar -- invalid CSS width risk and missing accessibility
- AGG-4: Dead code in `AppSidebar` after submissions removal
- AGG-5: `formatScore` not locale-aware and no unit tests
- AGG-6: `language-config-table.tsx` `confirmAction` unsafe type casting
- AGG-7: `PublicHeader` `loggedInUser.role` prop unused
- AGG-8: `document.execCommand("copy")` deprecated fallback
- AGG-9: `restore/route.ts` `.toFixed()` in audit log
- AGG-10: `allImageOptions` rebuilt every render

No cycle-21 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Migrate admin client raw `fetch()` calls to `apiClient` (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:**
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:107,130,153` (4 calls)
  - `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:138,169,246,267` (5 calls)
  - `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:91` (1 call)
  - `src/app/(dashboard)/dashboard/admin/roles/role-delete-dialog.tsx:46` (1 call)
- **Problem:** At least 11 raw `fetch()` calls across admin components manually set `X-Requested-With: XMLHttpRequest` instead of using the centralized `apiClient` from `@/lib/api/client.ts`. This is a DRY violation and CSRF maintenance risk.
- **Plan:**
  1. Import `apiClient` from `@/lib/api/client` in each affected file.
  2. Replace each `fetch(url, { headers: { "X-Requested-With": "XMLHttpRequest", ... } })` with `apiClient(url, { ... })`.
  3. Remove the manual `X-Requested-With` header from each call.
  4. Verify that `apiClient` preserves the existing `Content-Type` and other headers.
  5. Verify all gates pass.
- **Status:** DONE

### H2: Fix `language-config-table.tsx` `fetchImageStatus` error handling and add loading state (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:79-101`
- **Problem:** Three interrelated problems:
  1. `catch { /* ignore */ }` swallows all errors with no user feedback
  2. Non-OK responses are silently ignored
  3. No loading state means the UI shows "Not Built" badges during the fetch
- **Plan:**
  1. Add `imageStatusLoading` state variable.
  2. Set `imageStatusLoading = true` before the fetch, `false` after.
  3. In the catch block and non-OK else branch, show a toast error: `toast.error(t("toast.fetchImageStatusError"))` (add i18n key if needed).
  4. When `imageStatusLoading` is true and `imageInfo.size === 0`, show skeleton badges or "Loading..." instead of "Not Built".
  5. Verify all gates pass.
- **Status:** DONE

### M1: Fix disk usage bar accessibility and CSS width validation (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:291-303`
- **Problem:** Two issues:
  1. `diskUsage.usePercent` used as CSS width without validation -- if it doesn't include %, the CSS is invalid.
  2. Progress bar has no ARIA attributes.
- **Plan:**
  1. Ensure the width value always includes `%`: `style={{ width: diskUsage.usePercent.includes('%') ? diskUsage.usePercent : `${diskUsage.usePercent}%` }}`.
  2. Add `role="progressbar"`, `aria-valuenow={parseInt(diskUsage.usePercent) || 0}`, `aria-valuemin={0}`, `aria-valuemax={100}`, `aria-label={t("diskUsage")}` to the progress bar container div.
  3. Use the parsed value for the color logic as well (replace inline `parseInt` with the same `aria-valuenow` value).
  4. Verify all gates pass.
- **Status:** DONE

### M2: Clean up dead code in `AppSidebar` after submissions removal (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/layout/app-sidebar.tsx:185-194`
- **Problem:** Dead code after removing submissions from sidebar:
  - `resolveItemHref` still handles `/dashboard/submissions` (unreachable)
  - `prefersScopedReviewQueue` variable is dead
  - `canBypassModeRestrictions` includes `submissions.view_all` which may be stale
- **Plan:**
  1. Remove the `if (item.href === "/dashboard/submissions" && prefersScopedReviewQueue)` branch from `resolveItemHref`.
  2. Remove the `prefersScopedReviewQueue` variable declaration.
  3. Review `canBypassModeRestrictions` -- keep `submissions.view_all` because it still gates the ability to bypass platform mode restrictions for viewing all submissions, which is a broader permission than just the sidebar item. The sidebar item was removed, but the capability still matters for mode restriction bypassing (e.g., seeing problems in recruiting mode).
  4. Simplify `resolveItemHref` if it now only returns `item.href` -- remove the function entirely and use `item.href` directly.
  5. Verify all gates pass.
- **Status:** DONE

### M3: Make `formatScore` locale-aware and add unit tests (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/formatting.ts:84-87`
- **Problem:** `formatScore` uses `String(Math.round(score * 100) / 100)` instead of `formatNumber`, producing raw digits without locale-aware grouping. Also has no unit test coverage.
- **Plan:**
  1. Rewrite `formatScore` to use `formatNumber` internally: `formatNumber(Math.round(score * 100) / 100, { locale, maximumFractionDigits: 2 })`.
  2. Add `locale` parameter to `formatScore` signature (optional, defaults to DEFAULT_LOCALE).
  3. Add unit tests for `formatScore`: null/undefined returns "-", zero returns "0", large numbers get grouping, locale parameter works, rounding is correct.
  4. Verify all gates pass.
- **Status:** DONE

### M4: Replace `confirmAction` unsafe type casting with discriminated union (AGG-6)

- **Source:** AGG-6
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:77,641-644`
- **Problem:** `confirmAction` state uses `unknown` payload and unsafe `as` casts.
- **Plan:**
  1. Replace the `confirmAction` type with a discriminated union:
     ```typescript
     type ConfirmAction =
       | { type: "removeImage"; payload: LanguageConfig }
       | { type: "prune" }
       | { type: "reset"; payload: string }
       | { type: "resetAll" };
     ```
  2. Update the AlertDialog `onClick` to use the discriminated union without `as` casts.
  3. Verify all gates pass.
- **Status:** DONE

### M5: Remove unused `role` prop from `PublicHeader` (AGG-7)

- **Source:** AGG-7
- **Severity / confidence:** LOW / LOW
- **Citations:**
  - `src/components/layout/public-header.tsx:42`
  - `src/app/(dashboard)/layout.tsx:83`
  - `src/app/(public)/layout.tsx:31`
- **Problem:** `role` is declared in props and passed from both layouts but never read by `PublicHeader`.
- **Plan:**
  1. Remove `role?: string` from the `loggedInUser` prop type in `public-header.tsx`.
  2. Remove `role: session.user.role` from the `loggedInUser` object in `(dashboard)/layout.tsx`.
  3. Remove `role: session.user.role` from the `loggedInUser` object in `(public)/layout.tsx`.
  4. Verify all gates pass.
- **Status:** DONE

---

## Deferred items

### DEFER-1: Practice page progress-filter SQL CTE optimization (carried from cycle 18)

- **Source:** rpf-cycle-18 DEFER-1, rpf-cycle-19 DEFER-1, rpf-cycle-20 DEFER-1
- **Severity / confidence:** MEDIUM / MEDIUM
- **Original severity preserved:** MEDIUM / MEDIUM
- **Citations:** `src/app/(public)/practice/page.tsx:410-519`
- **Reason for deferral:** Significant refactoring scope. Current code works correctly for existing problem counts. Deferred since cycle 18 with no change.
- **Exit criterion:** Problem count exceeds 5,000 or a performance benchmark shows >2s page load time with progress filters.

### DEFER-2: `SubmissionListAutoRefresh` polling backoff (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-2, rpf-cycle-20 DEFER-2
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/submission-list-auto-refresh.tsx:22-28`
- **Reason for deferral:** Works correctly for normal operation. Visibility check prevents unnecessary refreshes.
- **Exit criterion:** Users report performance issues during server overload, or a standardized polling pattern with backoff is established.

### DEFER-3: Audit `forceNavigate` call sites (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-3, rpf-cycle-20 DEFER-3
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/lib/navigation/client.ts:3-5`
- **Reason for deferral:** `forceNavigate` is used intentionally. Not causing issues.
- **Exit criterion:** When a navigation bug is traced to `forceNavigate` being used where `router.push()` would suffice.

### DEFER-4: Mobile sign-out button touch target size (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-4, rpf-cycle-20 DEFER-4
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/layout/public-header.tsx:318-326`
- **Reason for deferral:** Current touch target (~36px) meets WCAG 2.2 minimum of 24px. UX refinement, not a bug.
- **Exit criterion:** When a mobile UX audit is performed, or when users report difficulty tapping the sign-out button.

### DEFER-5: Practice page decomposition -- extract data module (carried from cycle 18)

- **Source:** rpf-cycle-18 DEFER-2, rpf-cycle-20 DEFER-5
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/app/(public)/practice/page.tsx` (716 lines)
- **Reason for deferral:** Should be combined with DEFER-1. Extracting without fixing the query creates same issue in new module.
- **Exit criterion:** DEFER-1 is picked up, or the page exceeds 800 lines.

### DEFER-6: `use-unsaved-changes-guard.ts` uses `window.confirm()` (carried from cycle 20)

- **Source:** rpf-cycle-20 DEFER-6 (AGG-7 from cycle 20)
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/hooks/use-unsaved-changes-guard.ts:107`
- **Reason for deferral:** Conventional UX pattern for navigation guards. Replacing with AlertDialog requires significant API changes. The native dialog is expected behavior for this context.
- **Exit criterion:** When a design decision is made to use custom dialogs for all confirmations, or when a reusable async confirmation hook is created.

### DEFER-7: `document.execCommand("copy")` deprecated fallback (AGG-8)

- **Source:** AGG-8
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:**
  - `src/components/code/copy-code-button.tsx:29`
  - `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:224`
- **Reason for deferral:** The `document.execCommand("copy")` fallback currently works in all major browsers. While it is deprecated, no browser has removed it yet. The fallback is only triggered when the Clipboard API fails (rare in modern browsers over HTTPS). Replacing it requires either removing the fallback (which would break copy on very old browsers) or implementing a shared clipboard utility. This is a maintenance item, not a correctness issue.
- **Exit criterion:** A major browser removes `execCommand("copy")`, or a shared clipboard utility is implemented across the codebase.

### DEFER-8: `restore/route.ts` `.toFixed(1)` in audit log (AGG-9)

- **Source:** AGG-9
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/app/api/v1/admin/restore/route.ts:154-155`
- **Reason for deferral:** This is a server-side audit log string, not user-facing UI. The format is for admin consumption only. Using `formatBytes` would require importing the formatting module on the server side, which currently only uses client-compatible APIs. The impact is minimal.
- **Exit criterion:** When the formatting module is made server-side compatible, or when audit logs need to be localized.

### DEFER-9: `allImageOptions` rebuilt every render (AGG-10)

- **Source:** AGG-10
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:274`
- **Reason for deferral:** The array is small (~15 items) and the sort is trivial. The performance impact is negligible. Adding `useMemo` adds a dependency array that could become stale if the component grows.
- **Exit criterion:** When the image options list grows significantly, or when the component is refactored.

---

## Workspace-to-Public Migration Progress

**Current phase:** Phase 4 -- IN PROGRESS
**Next step:** Continue slimming down AppSidebar and cleaning up dead code from prior removals.

Per the user-injected TODO, this cycle makes incremental progress on the workspace-to-public migration through:

### M2: Clean up dead code in `AppSidebar` after submissions removal (AGG-4)

This directly supports the migration plan Phase 3 goal of slimming down AppSidebar. Removing dead code from prior navigation item removals keeps the sidebar clean as the migration progresses.

---

## Progress log

- 2026-04-20: Plan created from cycle-21 aggregate review. Archived completed cycle-20 plan.
- 2026-04-20: All priority items implemented. H1 (apiFetch migration), H2 (fetchImageStatus error handling), M1 (disk usage accessibility), M2 (AppSidebar dead code), M3 (formatScore locale-aware), M4 (discriminated union ConfirmAction), M5 (remove unused role prop) -- all DONE.
