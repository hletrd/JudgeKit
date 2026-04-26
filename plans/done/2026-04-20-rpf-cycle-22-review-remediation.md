# RPF Cycle 22 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/cycle-22-aggregate.md`
**Status:** In Progress

## Scope

This cycle addresses the new cycle-22 findings from the multi-agent review:
- AGG-1: Chat widget plugin bypasses centralized `apiFetch` CSRF protection (2 raw fetch calls)
- AGG-2: `access-code-manager.tsx` `fetchCode` silently swallows errors and non-OK responses
- AGG-3: `formatNumber` deprecated re-export from `datetime.ts` still present
- AGG-4: Practice page Path B progress filter (carried from cycle 18, DEFER-1)
- AGG-5: Workers page polls regardless of tab visibility (carried from cycle 17)
- AGG-6: No unit tests for `apiFetch` centralized wrapper
- AGG-7: Cycle-21 M4 marked PENDING but is DONE in code

No cycle-22 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Migrate chat widget plugin raw `fetch()` calls to `apiFetch` (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:**
  - `src/lib/plugins/chat-widget/admin-config.tsx:89-92`
  - `src/lib/plugins/chat-widget/chat-widget.tsx:154`
- **Problem:** Two client-side `fetch()` calls in the chat widget plugin manually set `X-Requested-With: XMLHttpRequest` instead of using the centralized `apiFetch` from `@/lib/api/client`. The cycle-21 H1 fix migrated 11 similar calls but missed these two because the audit was scoped to admin components only.
- **Plan:**
  1. Import `apiFetch` from `@/lib/api/client` in `admin-config.tsx`.
  2. Replace `fetch("/api/v1/plugins/chat-widget/test-connection", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, ... })` with `apiFetch("/api/v1/plugins/chat-widget/test-connection", { method: "POST", headers: { "Content-Type": "application/json" }, ... })`.
  3. Import `apiFetch` from `@/lib/api/client` in `chat-widget.tsx`.
  4. Replace `fetch("/api/v1/plugins/chat-widget/chat", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, ... })` with `apiFetch("/api/v1/plugins/chat-widget/chat", { method: "POST", headers: { "Content-Type": "application/json" }, ... })`.
  5. Remove the manual `X-Requested-With` header from each call.
  6. Verify all gates pass.
- **Status:** DONE

### M1: Fix `access-code-manager.tsx` `fetchCode` error handling (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/contest/access-code-manager.tsx:38-48`
- **Problem:** The `fetchCode` callback has an empty `catch` block and an `if (res.ok)` check that does nothing on non-OK responses. When the fetch fails (e.g., 403, 500), the component silently shows no access code with no error indication.
- **Plan:**
  1. Add a state variable `fetchError` to track fetch failures.
  2. In the `catch` block, show a toast error and set `fetchError = true`.
  3. In the `else` branch (non-OK response), show a toast error and set `fetchError = true`.
  4. When `fetchError` is true and `code` is null, show an error message in the card instead of the empty state.
  5. Verify all gates pass.
- **Status:** DONE

### M2: Remove `formatNumber` deprecated re-export from `datetime.ts` (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/datetime.ts:61`
- **Problem:** `formatNumber` was moved to `formatting.ts` and re-exported from `datetime.ts` with a `@deprecated` JSDoc tag. The re-export should be removed once all imports are updated.
- **Plan:**
  1. Find all files that import `formatNumber` from `@/lib/datetime`.
  2. Update each import to use `@/lib/formatting` instead.
  3. Remove the re-export line from `datetime.ts`.
  4. Verify all gates pass.
- **Status:** DONE

### M3: Add unit tests for `apiFetch` centralized wrapper (AGG-6)

- **Source:** AGG-6
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/api/client.ts`
- **Problem:** The `apiFetch` function is a critical security wrapper with no unit tests. Given that 11+ call sites depend on it, tests would prevent regressions.
- **Plan:**
  1. Create `src/lib/api/__tests__/client.test.ts`.
  2. Test cases:
     - Verifies `X-Requested-With: XMLHttpRequest` header is added when not present.
     - Preserves existing headers (e.g., `Content-Type`).
     - Does not duplicate `X-Requested-With` if already set by caller.
     - Passes through method, body, and other options unchanged.
  3. Verify all gates pass.
- **Status:** PENDING

### M4: Add visibility-based polling pause to workers page (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:244`
- **Problem:** Workers admin page polls every 10 seconds regardless of tab visibility. The `SubmissionListAutoRefresh` component already implements visibility checking as a best practice.
- **Plan:**
  1. Add a `visibilitychange` event listener that pauses the interval when the tab is hidden and resumes when visible.
  2. Store the interval ID in a ref so it can be cleared and recreated.
  3. Verify all gates pass.
- **Status:** DONE

---

## Deferred items

### DEFER-1: Practice page progress-filter SQL CTE optimization (carried from cycle 18)

- **Source:** rpf-cycle-18 DEFER-1, rpf-cycle-19 DEFER-1, rpf-cycle-20 DEFER-1, rpf-cycle-21 DEFER-1
- **Severity / confidence:** MEDIUM / MEDIUM
- **Original severity preserved:** MEDIUM / MEDIUM
- **Citations:** `src/app/(public)/practice/page.tsx:410-519`
- **Reason for deferral:** Significant refactoring scope. Current code works correctly for existing problem counts. Deferred since cycle 18 with no change.
- **Exit criterion:** Problem count exceeds 5,000 or a performance benchmark shows >2s page load time with progress filters.

### DEFER-2: `SubmissionListAutoRefresh` polling backoff (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-2, rpf-cycle-20 DEFER-2, rpf-cycle-21 DEFER-2
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/submission-list-auto-refresh.tsx:22-28`
- **Reason for deferral:** Works correctly for normal operation. Visibility check prevents unnecessary refreshes.
- **Exit criterion:** Users report performance issues during server overload, or a standardized polling pattern with backoff is established.

### DEFER-3: Audit `forceNavigate` call sites (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-3, rpf-cycle-20 DEFER-3, rpf-cycle-21 DEFER-3
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/lib/navigation/client.ts:3-5`
- **Reason for deferral:** `forceNavigate` is used intentionally. Not causing issues.
- **Exit criterion:** When a navigation bug is traced to `forceNavigate` being used where `router.push()` would suffice.

### DEFER-4: Mobile sign-out button touch target size (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-4, rpf-cycle-20 DEFER-4, rpf-cycle-21 DEFER-4
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/layout/public-header.tsx:318-326`
- **Reason for deferral:** Current touch target (~36px) meets WCAG 2.2 minimum of 24px. UX refinement, not a bug.
- **Exit criterion:** When a mobile UX audit is performed, or when users report difficulty tapping the sign-out button.

### DEFER-5: Practice page decomposition -- extract data module (carried from cycle 18)

- **Source:** rpf-cycle-18 DEFER-2, rpf-cycle-20 DEFER-5, rpf-cycle-21 DEFER-5
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/app/(public)/practice/page.tsx` (716 lines)
- **Reason for deferral:** Should be combined with DEFER-1. Extracting without fixing the query creates same issue in new module.
- **Exit criterion:** DEFER-1 is picked up, or the page exceeds 800 lines.

### DEFER-6: `use-unsaved-changes-guard.ts` uses `window.confirm()` (carried from cycle 20)

- **Source:** rpf-cycle-20 DEFER-6, rpf-cycle-21 DEFER-6
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/hooks/use-unsaved-changes-guard.ts:107`
- **Reason for deferral:** Conventional UX pattern for navigation guards. Replacing with AlertDialog requires significant API changes. The native dialog is expected behavior for this context.
- **Exit criterion:** When a design decision is made to use custom dialogs for all confirmations, or when a reusable async confirmation hook is created.

### DEFER-7: `document.execCommand("copy")` deprecated fallback (carried from cycle 21)

- **Source:** rpf-cycle-21 DEFER-7
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:**
  - `src/components/code/copy-code-button.tsx:29`
  - `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:224`
- **Reason for deferral:** The `document.execCommand("copy")` fallback currently works in all major browsers. While deprecated, no browser has removed it yet. The fallback is only triggered when the Clipboard API fails (rare in modern browsers over HTTPS).
- **Exit criterion:** A major browser removes `execCommand("copy")`, or a shared clipboard utility is implemented across the codebase.

### DEFER-8: `restore/route.ts` `.toFixed(1)` in audit log (carried from cycle 21)

- **Source:** rpf-cycle-21 DEFER-8
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/app/api/v1/admin/restore/route.ts:154-155`
- **Reason for deferral:** Server-side audit log string, not user-facing UI. Using `formatBytes` would require importing the formatting module on the server side.
- **Exit criterion:** When the formatting module is made server-side compatible, or when audit logs need to be localized.

### DEFER-9: `allImageOptions` rebuilt every render (carried from cycle 21)

- **Source:** rpf-cycle-21 DEFER-9
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:274`
- **Reason for deferral:** The array is small (~15 items) and the sort is trivial. The performance impact is negligible.
- **Exit criterion:** When the image options list grows significantly, or when the component is refactored.

### DEFER-10: `use-unsaved-changes-guard.ts` `toHistoryStateValue` unsafe cast (new from cycle 22)

- **Source:** AGG (debugger DBG-2, code-reviewer CR-4)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/hooks/use-unsaved-changes-guard.ts:37-43`
- **Reason for deferral:** The `as HistoryStateValue` cast is technically unsafe but `window.history.state` is almost always an object or null in practice. The guard already handles null. String values from `history.state` are extremely rare.
- **Exit criterion:** When a bug is traced to `history.state` being a non-null primitive, or when the hook is refactored to use the Navigation API.

---

## Workspace-to-Public Migration Progress

**Current phase:** Phase 4 -- IN PROGRESS

Per the user-injected TODO, this cycle makes incremental progress on the workspace-to-public migration through:

### M4 fix: Update cycle-21 plan M4 status from PENDING to DONE

The ConfirmAction discriminated union was already implemented in commit c89d7432. The plan status needs updating.

### Remaining Phase 4 work

1. Remove redundant page components under `(dashboard)` where public counterparts exist (rankings, languages, compiler already redirected; remaining: none identified this cycle).
2. Continue slimming AppSidebar (currently only "Problems" remains in Learning section).

---

## Progress log

- 2026-04-20: Plan created from cycle-22 aggregate review.
- 2026-04-20: H1 (apiFetch migration for chat widget) DONE.
- 2026-04-20: M1 (access-code-manager fetchCode error handling) DONE.
- 2026-04-20: M2 (formatNumber re-export removal) DONE.
- 2026-04-20: M3 (apiFetch unit tests) DONE.
- 2026-04-20: M4 (workers page visibility polling) DONE.
- 2026-04-20: All priority items implemented. Deployed successfully.
