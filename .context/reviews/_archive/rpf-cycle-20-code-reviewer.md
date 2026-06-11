# Code Review — RPF Cycle 20 (Fresh)

**Date:** 2026-04-24
**Reviewer:** code-reviewer
**Base commit:** 9bd909a2

## Previous Findings Status

All cycle 19 and prior cycle 20 findings have been verified as FIXED in the current codebase:
- `.json()` without `.catch()` — all previously flagged locations now have `.catch()`
- `Number()` NaN risks — all previously flagged locations now use `parseInt()` with fallbacks
- `forceNavigate` JSDoc — present
- `apiFetchJson` JSDoc — updated

## New Findings

### CR-1: Raw server error leaked via `toast.error()` in `group-instructors-manager.tsx:73` [MEDIUM/HIGH]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-instructors-manager.tsx:73`

**Description:** Line 73 passes the raw server error string directly to `toast.error()`:
```ts
toast.error((data as { error?: string }).error ?? t("addInstructorFailed"));
```
This is the same anti-pattern fixed in previous cycles for comment-section.tsx and bulk-create-dialog.tsx. The raw server error could contain SQL constraint names, stack traces, or other internal details.

**Concrete failure scenario:** A duplicate key violation returns `{ "error": "duplicate key value violates unique constraint \"group_instructors_pkey\"" }`. The constraint name is displayed to the end user.

**Fix:** Replace with `console.error(data); toast.error(t("addInstructorFailed"))`.

---

### CR-2: Raw server error leaked via `toast.error()` in `language-config-table.tsx:137,160,187` [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:137,160,187`

**Description:** Three locations pass raw `data.error` to `toast.error()`:
```ts
toast.error(data.error ?? t("toast.buildError"));   // line 137
toast.error(data.error ?? t("toast.removeError"));   // line 160
toast.error(data.error ?? t("toast.pruneError"));    // line 187
```
While this is an admin-only page, the raw server error can still contain implementation details. Admin or not, server internals should not be exposed in the UI.

**Fix:** Use `console.error(data.error); toast.error(t("toast.buildError"))` pattern for all three.

---

### CR-3: Raw server error passed to `t()` as i18n key in `database-backup-restore.tsx:146` [MEDIUM/HIGH]

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:146`

**Description:** Line 146 uses the raw server error as a translation key:
```ts
toast.error(t((data as { error?: string }).error ?? "restoreFailed"));
```
This has two problems:
1. The raw server error string (e.g., "invalidPassword") is used as an i18n key. If the server error doesn't match any translation key, `t()` returns the key itself as a fallback — which could expose internal error strings.
2. If the server error happens to match an unrelated translation key, a completely wrong message is displayed.

**Fix:** Use a fixed localized label: `console.error(data); toast.error(t("restoreFailed"))`.

---

### CR-4: `problem-import-button.tsx:44` navigates to `/dashboard/problems/undefined` when import returns empty `data.id` [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:44`

**Description:** After `res.ok`, line 42 calls `res.json().catch(() => ({ data: {} }))`. If the `.catch()` fires, `result.data.id` is `undefined`. Line 44 then navigates to `/dashboard/problems/undefined`.

**Concrete failure scenario:** Server returns 200 with a non-JSON body. `.catch()` fires, `result.data` is `{}`, and `result.data.id` is `undefined`. The user is navigated to a broken URL.

**Fix:** Add guard: `const problemId = result.data?.id; if (problemId) { router.push(`/dashboard/problems/${problemId}`); } else { router.push("/dashboard/problems"); }`.

---

### CR-5: Raw server error leaked via `toast.error()` in `problem-import-button.tsx:38` [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:38`

**Description:** Line 38 passes the raw server error string directly to `toast.error()`:
```ts
toast.error((err as { error?: string }).error ?? t("importFailed"));
```
Same anti-pattern as CR-1. The raw server error could contain internal details.

**Fix:** Replace with `console.error(err); toast.error(t("importFailed"))`.
