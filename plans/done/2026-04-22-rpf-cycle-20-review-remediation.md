# RPF Cycle 20 — Review Remediation Plan (Updated)

**Date:** 2026-04-24
**Source:** `.context/reviews/rpf-cycle-20-aggregate.md`
**Status:** Done

## Scope

This cycle addresses NEW findings from the fresh RPF cycle 20 aggregate review:
- AGG-1: Raw server error leaked to users via `toast.error()` — 4 files, 6 locations
- AGG-2: `problem-import-button.tsx` navigates to `/dashboard/problems/undefined` when JSON parse fallback fires

Previous cycle 20 findings (AGG-1 through AGG-8 from the prior review) are all confirmed FIXED in the current codebase.

No review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### M1: Stop leaking raw server errors to users via `toast.error()` in `group-instructors-manager.tsx` (AGG-1)

- **Source:** AGG-1 (partial)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/(dashboard)/dashboard/groups/[id]/group-instructors-manager.tsx:73`
- **Problem:** Line 73 passes raw server error to `toast.error()`. Server error could contain SQL constraint names or stack traces.
- **Plan:**
  1. Change line 73 from `toast.error((data as { error?: string }).error ?? t("addInstructorFailed"))` to `console.error(data); toast.error(t("addInstructorFailed"))`
  2. Verify gate passes
- **Status:** DONE

---

### M2: Stop leaking raw server errors to users via `toast.error()` in `language-config-table.tsx` (AGG-1)

- **Source:** AGG-1 (partial)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:137,160,187`
- **Problem:** Three locations pass raw `data.error` to `toast.error()`.
- **Plan:**
  1. Line 137: Change `toast.error(data.error ?? t("toast.buildError"))` to `console.error(data.error); toast.error(t("toast.buildError"))`
  2. Line 160: Change `toast.error(data.error ?? t("toast.removeError"))` to `console.error(data.error); toast.error(t("toast.removeError"))`
  3. Line 187: Change `toast.error(data.error ?? t("toast.pruneError"))` to `console.error(data.error); toast.error(t("toast.pruneError"))`
  4. Verify gate passes
- **Status:** DONE

---

### M3: Stop leaking raw server errors via `t()` key in `database-backup-restore.tsx` (AGG-1)

- **Source:** AGG-1 (partial)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:146`
- **Problem:** Raw server error used as `t()` translation key. If no matching key, raw string shown verbatim.
- **Plan:**
  1. Change line 146 from `toast.error(t((data as { error?: string }).error ?? "restoreFailed"))` to `console.error(data); toast.error(t("restoreFailed"))`
  2. Verify gate passes
- **Status:** DONE

---

### M4: Stop leaking raw server errors to users via `toast.error()` in `problem-import-button.tsx` (AGG-1)

- **Source:** AGG-1 (partial)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:38`
- **Problem:** Line 38 passes raw server error to `toast.error()`.
- **Plan:**
  1. Change line 38 from `toast.error((err as { error?: string }).error ?? t("importFailed"))` to `console.error(err); toast.error(t("importFailed"))`
  2. Verify gate passes
- **Status:** DONE

---

### M5: Add undefined-navigation guard in `problem-import-button.tsx` (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:42-44`
- **Problem:** After `res.ok`, if `.json()` fallback fires, `result.data.id` is `undefined` and user is navigated to `/dashboard/problems/undefined`.
- **Plan:**
  1. After line 42, add guard: `const problemId = result.data?.id;`
  2. Change line 44 to: `if (problemId) { router.push(`/dashboard/problems/${problemId}`); } else { router.push("/dashboard/problems"); }`
  3. Verify gate passes
- **Status:** DONE

---

## Deferred items

### DEFER-1: Practice page Path B progress filter — fetches all into memory (carried from cycles 18-20)

- **Source:** PERF-2 (cycle 18)
- **Severity / confidence:** MEDIUM / MEDIUM (original preserved)
- **Citations:** `src/app/(public)/practice/page.tsx:410-519`
- **Reason for deferral:** Requires SQL CTE/subquery implementation. Significant backend change.
- **Exit criterion:** Progress filter logic moved to SQL query.

### DEFER-2: Mobile menu sign-out button touch target (carried from cycle 19)

- **Source:** AGG-11 (cycle 19)
- **Severity / confidence:** LOW / LOW (original preserved)
- **Citations:** `src/components/layout/public-header.tsx:319`
- **Reason for deferral:** Meets WCAG 2.2 minimum (24px) but below recommended 44px for touch targets.
- **Exit criterion:** When an accessibility improvement pass is scheduled.

### DEFER-3: ESLint rule to prevent unguarded `.json()` calls (from ARCH-1)

- **Source:** ARCH-1 (cycle 20)
- **Severity / confidence:** MEDIUM / HIGH (architectural concern)
- **Citations:** All files using `apiFetch` + `.json()` directly
- **Reason for deferral:** Requires custom ESLint rule development and CI integration. Not a code fix.
- **Exit criterion:** When a tooling enforcement pass is scheduled.

### DEFER-4: Component tests for create-group-dialog, admin-config, comment-section, providers (from TE-1 through TE-4)

- **Source:** TE-1 through TE-4 (cycle 20)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** See test-engineer review for specific file citations
- **Reason for deferral:** Test infrastructure for component-level mocking of `apiFetch` needs setup. Large scope.
- **Exit criterion:** When component test coverage pass is scheduled.

### DEFER-5: Raw server error passed to `Error()` constructor in throw statements (from CR-5)

- **Source:** CR-5 (cycle 20 fresh review)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:**
  - `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:92`
  - `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:222`
  - `src/components/exam/start-exam-button.tsx:42`
  - `src/app/(dashboard)/dashboard/problem-sets/_components/problem-set-form.tsx:130,159,181,216`
- **Reason for deferral:** Most of these have error-message mapping functions (e.g., `getErrorMessage()`) that only match known server error codes and fall back to a generic message. The pattern itself (server error code used as `Error.message` which is then mapped) is a valid design pattern for mapped error handling — only the unmapped catch blocks need auditing.
- **Exit criterion:** When a comprehensive error-mapping audit is scheduled.

---

## Progress log

- 2026-04-22: Plan created from RPF cycle 20 aggregate review. 8 tasks (M1-M4, L1-L4). 4 deferred items. All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
- 2026-04-22: All 8 tasks implemented (M1-M4, L1-L4). All gates pass (eslint, next build, vitest unit). 6 commits pushed.
- 2026-04-24: Fresh review conducted. 2 new deduped findings (AGG-1: raw server error leaks in 4 files/6 locations, AGG-2: undefined navigation crash in problem-import-button). Plan updated with 5 new implementation tasks (M1-M5). DEFER-5 added for throw-statement error codes.
- 2026-04-24: All 5 tasks implemented (M1-M5). All gates pass (eslint, tsc, vitest, next build). 4 commits pushed.
