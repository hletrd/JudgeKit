# RPF Cycle 27 Review Remediation Plan

**Date:** 2026-04-22 (updated)
**Source:** `.context/reviews/cycle-27-aggregate.md`
**Status:** In progress

## Scope

This cycle addresses the updated cycle-27 findings from the fresh multi-agent review:
- AGG-1: Ungated `console.error` in 14 client-side components [MEDIUM/MEDIUM] -- DONE
- AGG-2: `admin-config.tsx` double `.json()` anti-pattern [LOW/MEDIUM] -- DONE
- AGG-3: `bulk-create-dialog.tsx` raw `err.message` in user-visible string [LOW/LOW] -- DONE
- AGG-4: Ungated `console.error` in 7 additional client-side call sites across 5 files [MEDIUM/MEDIUM] -- NEW, to fix

Prior cycle-27 findings (AGG-1 through AGG-12 from the old review) are already fixed:
- Old AGG-1 through AGG-3: Already fixed (clock-skew, toLocaleString, non-null assertion)
- Old AGG-8: Error boundary `console.error` gating: DONE (commit 02985db9)
- Old AGG-9: `console.warn` gating: DONE (commit ed7eb3f0)
- Old AGG-10: not-found.tsx tracking comment: DONE (commit 080670c3)
- Old AGG-4, AGG-5, AGG-6, AGG-7, AGG-11, AGG-12: Deferred (see deferred section)

No cycle-27 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Gate 14 ungated `console.error` calls in client components behind dev-only check (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:**
  - `src/components/discussions/discussion-post-form.tsx:47,54`
  - `src/components/discussions/discussion-thread-form.tsx:53,61`
  - `src/components/discussions/discussion-post-delete-button.tsx:29,36`
  - `src/components/discussions/discussion-thread-moderation-controls.tsx:77,83,98,105`
  - `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:66`
  - `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx:43`
  - `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:106`
  - `src/app/(dashboard)/dashboard/admin/roles/role-delete-dialog.tsx:58`
  - `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:310`
  - `src/app/(dashboard)/dashboard/problem-sets/_components/problem-set-form.tsx:241`
  - `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:214`
  - `src/components/code/compiler-client.tsx:292`
  - `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:78`
- **Problem:** 14 client-side `console.error()` calls write unstructured error data to browser DevTools in production, violating the "Log errors in development only" convention documented in `src/lib/api/client.ts:23`. The error boundary components were fixed in prior cycles, but API-consuming components were not.
- **Plan:**
  1. Gate each `console.error` call behind `if (process.env.NODE_ENV === "development")`.
  2. Pattern: wrap the existing `console.error(...)` call with the dev-only guard.
  3. For `getErrorMessage` default branches (edit-group-dialog, create-group-dialog, create-problem-form, problem-set-form), move the `console.error` inside the `if` block.
  4. For catch blocks (discussion components, role editor, role delete, bulk-create, compiler-client, comment-section), wrap the `console.error` with the guard.
  5. Verify all gates pass.
- **Status:** DONE (commit 301963e0)

- **Source:** AGG-2
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/plugins/chat-widget/admin-config.tsx:99+103`
- **Problem:** The test-connection handler calls `response.json()` twice (error branch line 99, success branch line 103). This is the same anti-pattern fixed in cycle 26 AGG-1. The `return` at line 101 prevents runtime errors, but the pattern violates the documented convention.
- **Plan:**
  1. Parse response body once before branching: `const data = await response.json().catch(() => ({}));`
  2. Check `response.ok` after parsing.
  3. If not OK, use `data.error` for the error display.
  4. If OK, use `data` for the success display.
  5. Verify all gates pass.
- **Status:** DONE (commit c469792c, type fix ff66124d)

- **Source:** AGG-3
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:194`
- **Problem:** `setParseError(t("bulkCsvParseError", { message: err.message }))` interpolates raw `err.message` from papaparse into a user-visible string. While papaparse errors are typically benign, this pattern contradicts the convention of never showing raw error details to users.
- **Plan:**
  1. Replace `err.message` with a truncated/sanitized version, or use a generic fallback like `tCommon("error")`.
  2. Verify all gates pass.
- **Status:** DONE (commit 5928729c)

---

### H2: Gate 7 remaining ungated `console.error` calls in client components behind dev-only check (AGG-4 from cycle 27b)

- **Source:** Cycle 27b AGG-1 (code-reviewer CR-1 through CR-5, security-reviewer SEC-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:**
  - `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:206`
  - `src/app/(dashboard)/dashboard/groups/[id]/group-instructors-manager.tsx:73`
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:137`
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:161`
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:189`
  - `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:38`
  - `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:146`
- **Problem:** 7 client-side `console.error()` calls across 5 files were missed by the previous cycle's AGG-1 fix (which covered 14 calls). These ungated calls write unstructured error data to browser DevTools in production, violating the "Log errors in development only" convention documented in `src/lib/api/client.ts:23`.
- **Plan:**
  1. Gate each `console.error` call behind `if (process.env.NODE_ENV === "development")`.
  2. For `assignment-form-dialog.tsx`: wrap the default branch `console.error` with the guard.
  3. For `group-instructors-manager.tsx`: wrap the `console.error(data)` with the guard.
  4. For `language-config-table.tsx`: wrap all 3 `console.error(data.error)` calls with the guard.
  5. For `problem-import-button.tsx`: wrap the `console.error(err)` with the guard.
  6. For `database-backup-restore.tsx`: wrap the `console.error(data)` with the guard.
  7. Verify all gates pass.
- **Status:** DONE

---

## Deferred items

### DEFER-1 through DEFER-13: Carried from cycle 23

See `plans/open/2026-04-20-rpf-cycle-23-review-remediation.md` for the full deferred list. All carry forward unchanged.

### DEFER-14: Centralized error handling pattern / useApiFetch hook (carried from cycle 24)

- **Source:** AGG-5 (architect ARCH-3, document-specialist DOC-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Original severity preserved:** MEDIUM / MEDIUM
- **Citations:** Cross-cutting: `src/lib/api/client.ts`, all components using apiFetch
- **Reason for deferral:** The immediate fixes (H1) address the symptom. A centralized `useApiFetch` hook or ESLint rule is a larger refactor that should be done holistically, not piecemeal. H1 provides the immediate fixes; the shared hook is the long-term DRY improvement.
- **Exit criterion:** When a cycle has capacity for a focused refactor pass, or when a new catch-block pattern violation is found.

### DEFER-15: Replace `window.confirm()` in `use-unsaved-changes-guard.ts` with AlertDialog (carried from cycle 25)

- **Source:** AGG-5 (cycle 25 deep review, designer DES-3), carried from DEFER-6 (cycle 20)
- **Severity / confidence:** MEDIUM / MEDIUM (upgraded from LOW/MEDIUM)
- **Original severity preserved:** MEDIUM / MEDIUM (upgraded)
- **Citations:** `src/hooks/use-unsaved-changes-guard.ts:107`
- **Reason for deferral:** The `beforeunload` event handler can only use the native dialog (browser limitation). For click interception and history navigation, replacing `confirm()` with an async AlertDialog would require significant refactoring of the hook's control flow.
- **Exit criterion:** When a reusable async confirmation hook is created, or when the hook is refactored to use the Navigation API's `navigate` event.

### DEFER-16: `ContestAnnouncements` polling visibility edge case on mount (carried from cycle 25)

- **Source:** AGG-7 (cycle 25 perf sweep)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/contest/contest-announcements.tsx:71-95`
- **Reason for deferral:** The brief timing window (<1ms) where the interval starts before `syncVisibility` checks tab state is harmless in practice.
- **Exit criterion:** When a shared `useVisibilityAwarePolling` hook (DEFER-11) is implemented.

### DEFER-17: Inconsistent `createApiHandler` across route handlers (from AGG-4)

- **Source:** AGG-4 (architect ARCH-2)
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** 22 raw route handlers in `src/app/api/`
- **Reason for deferral:** Migrating routes to `createApiHandler` is a large-scale refactor that should be done holistically. Some routes (SSE streaming, judge token auth, multipart form data) have legitimate reasons to avoid the abstraction.
- **Exit criterion:** When a cycle has capacity for a focused API-route refactor pass, or when a new security-critical auth change requires updating all routes.

### DEFER-18: Contest layout forced full page navigation (from AGG-11)

- **Source:** AGG-11 (fresh architect/debugger review)
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/contests/layout.tsx:16-45`
- **Reason for deferral:** The workaround is necessary due to a Next.js 16 RSC streaming bug with nginx proxy headers. The existing TODO comment tracks removal.
- **Exit criterion:** When the Next.js bug is fixed in a version the project upgrades to. Track via the TODO in the file.

### DEFER-19: `use-source-draft.ts` JSON.parse runtime validation (from AGG-12)

- **Source:** AGG-12 (fresh code-quality review)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/hooks/use-source-draft.ts:185`
- **Reason for deferral:** The JSON.parse is already inside a try/catch block. The `as Partial<DraftPayload>` cast bypasses runtime validation, but the hook handles malformed data gracefully by falling back to defaults.
- **Exit criterion:** When the draft schema changes significantly, or when a shared localStorage validation utility is created.

### DEFER-20: Contest replay setInterval vs recursive setTimeout (carried from cycle 26)

- **Source:** Cycle 26 AGG-5, cycle 27 PERF-1
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/contest/contest-replay.tsx:77-87`
- **Reason for deferral:** Low priority. The `setInterval` works correctly for the replay use case. The drift issue only manifests under browser throttling, which is unlikely for a user-initiated replay.
- **Exit criterion:** When a cycle has capacity for a UI polish pass, or when a user reports a replay timing issue.

### DEFER-21: Sidebar interval re-entry edge case (carried from cycle 26)

- **Source:** Cycle 26 AGG-6, cycle 27 PERF-2
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:53-89`
- **Reason for deferral:** The edge case requires a very specific sequence (assignment added while interval is stopped but component still mounted). Low real-world impact.
- **Exit criterion:** When a shared `useVisibilityAwarePolling` hook is implemented, or when a user reports a stale timer issue.

---

## Progress log

- 2026-04-20: Plan created from initial cycle-27 aggregate review. Prior AGG-1 through AGG-3 already fixed. New findings AGG-8 through AGG-12 added as implementation lanes.
- 2026-04-20: H1 (error boundary console.error) DONE — gated behind dev-only check in all 4 error boundary components (commit 02985db9).
- 2026-04-20: M1 (console.warn) DONE — gated behind dev-only check in create-problem-form (commit ed7eb3f0).
- 2026-04-20: M2 (not-found.tsx tracking comment) DONE — added Korean-locale documentation comment (commit 080670c3).
- 2026-04-20: M3 (migration Phase 5) DONE — evaluated admin sidebar mobile behavior (commit edca1d5e).
- 2026-04-20: All gates green. Deploy attempted but failed (expected -- local dev machine).
- 2026-04-22: Plan updated with fresh findings from cycle 27 re-review. New AGG-1 (ungated console.error x14), AGG-2 (admin-config double .json()), AGG-3 (bulk-create err.message). Prior H1/M1/M2/M3 all DONE.
- 2026-04-22: H1 DONE — gated 14 ungated console.error calls behind dev-only check (commit 301963e0). Fixed 5 test files missing required props (commit e8cfd718).
- 2026-04-22: M1 DONE — eliminated double .json() anti-pattern in admin-config.tsx (commits c469792c, ff66124d).
- 2026-04-22: M2 DONE — truncated raw err.message in bulk-create-dialog.tsx (commit 5928729c).
- 2026-04-22: All gates green (eslint 0 errors, tsc --noEmit clean, vitest 294/294 2114 tests, next build success).
- 2026-04-25: Fresh cycle 27b review identified 7 additional ungated `console.error` calls across 5 files (AGG-4). Prior AGG-1/2/3 fixes verified as still in place. H2 added for new findings.
- 2026-04-25: H2 DONE — gated 7 ungated console.error calls behind dev-only check in assignment-form-dialog, group-instructors-manager, language-config-table (3 calls), problem-import-button, database-backup-restore. All gates green (eslint 0, tsc clean, vitest 302/302 2195 tests, next build success).
