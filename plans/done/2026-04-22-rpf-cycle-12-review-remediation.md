# RPF Cycle 12 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`
**Status:** Done (H1, H2, L1, L2 all complete)

## Scope

This cycle addresses findings from the RPF cycle 12 multi-agent review:
- AGG-1: `language-config-table.tsx` icon-only buttons missing `aria-label` — WCAG 4.1.2 violation
- AGG-2: Unguarded `res.json()` on error paths — two components missed in prior sweep
- AGG-3: `shortcuts-help.tsx` icon-only button missing `aria-label`
- AGG-4: `language-config-table.tsx:94` unguarded `res.json()` on success path

No cycle-12 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Add `aria-label` to icon-only buttons in `language-config-table.tsx` (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:437,440,452`
- **Cross-agent signal:** 6 of 11 review perspectives
- **Problem:** Three icon-only buttons (Edit/Pencil, Build/Hammer, Remove/Trash2) in the language table lack `aria-label` attributes. The Edit button has neither `title` nor `aria-label`. The Build and Remove buttons have `title` but not `aria-label`. This fails WCAG 4.1.2 and is inconsistent with other icon-only buttons in the codebase.
- **Plan:**
  1. Add `aria-label={t("edit.title")}` to the Edit button (line 437)
  2. Add `aria-label={t("actions.build")}` to the Build button (line 440) — alongside existing `title`
  3. Add `aria-label={t("actions.remove")}` to the Remove button (line 452) — alongside existing `title`
  4. Verify i18n keys exist in admin.languages namespace
  5. Verify all gates pass
- **Status:** DONE — Commit `5891f6e5`

### H2: Add `.catch()` guards to unguarded `res.json()` on error paths (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:**
  - `src/app/(dashboard)/dashboard/groups/[id]/group-instructors-manager.tsx:72`
  - `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:32`
- **Cross-agent signal:** 8 of 11 review perspectives
- **Problem:** Both files call `await res.json()` on the error path (`!res.ok`) without a `.catch()` guard. The established pattern is to use `.json().catch(() => ({}))` on error paths. If the server returns a non-JSON body (e.g., 502 HTML), `res.json()` throws SyntaxError.
- **Plan:**
  1. In `group-instructors-manager.tsx:72`: Change `const data = await res.json()` to `const data = await res.json().catch(() => ({}))` and update error handler to `toast.error((data as { error?: string }).error ?? t("addInstructorFailed"))`
  2. In `problem-import-button.tsx:32`: Change `const err = await res.json()` to `const err = await res.json().catch(() => ({}))` and update error handler to `toast.error((err as { error?: string }).error ?? t("importFailed"))`
  3. Verify all gates pass
- **Status:** DONE — Commit `c56634c8`

### L1: Add `aria-label` to keyboard shortcuts button in `shortcuts-help.tsx` (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/code/shortcuts-help.tsx:53`
- **Cross-agent signal:** 4 of 11 review perspectives
- **Problem:** The keyboard shortcuts button uses `size="icon-sm"` with only `title`, no `aria-label`. Same WCAG 4.1.2 issue as AGG-1 but a single instance.
- **Plan:**
  1. Add `aria-label={t("shortcutsTitle")}` to the Button
  2. Verify all gates pass
- **Status:** DONE — Commit `681c96dd`

### L2: Add `.catch()` guard to unguarded `res.json()` on success path in `language-config-table.tsx` (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:94`
- **Cross-agent signal:** 2 of 11 review perspectives
- **Problem:** On the success path of `fetchImageStatus`, `await res.json()` is called without a `.catch()` guard. If a 200 response has a non-JSON body, `res.json()` throws SyntaxError. The outer catch handles it but the exception is avoidable.
- **Plan:**
  1. Wrap the `res.json()` call in a try-catch within the success path, or add `.catch(() => ({ data: {} }))`
  2. Verify all gates pass
- **Status:** DONE — Commit `cc77ef05`

---

## Deferred items

### DEFER-1 through DEFER-35: Carried from cycle 11 plan

See `plans/open/2026-04-22-rpf-cycle-11-review-remediation.md` for the full deferred list. All carry forward unchanged. Key items:

- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-24: Invitation URL uses window.location.origin (also SEC-2)
- DEFER-31: Unit tests for problem-submission-form.tsx
- DEFER-33: Encryption module integrity check / HMAC (SEC-1)
- DEFER-35: Add `.catch()` guards to unguarded `response.json()` on success paths where result IS used (AGG-5, carried)

### DEFER-36: Unit tests for group-instructors-manager.tsx (from TE-1)

- **Source:** TE-1
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/app/(dashboard)/dashboard/groups/[id]/group-instructors-manager.tsx`
- **Reason for deferral:** The code fix (H2) addresses the immediate bug. Adding comprehensive unit tests is a larger effort that should be done in a dedicated test coverage pass.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-37: Unit tests for problem-import-button.tsx (from TE-2)

- **Source:** TE-2
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx`
- **Reason for deferral:** The code fix (H2) addresses the immediate bug. Adding unit tests is a separate effort.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-38: Unit tests for language-config-table.tsx (from TE-4)

- **Source:** TE-4
- **Severity / confidence:** LOW / LOW (original preserved)
- **Citations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`
- **Reason for deferral:** Admin-only component with lower impact. Adding tests is a separate effort.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-39: Centralized error-to-i18n mapping utility (from ARCH-1, carried)

- **Source:** ARCH-1
- **Severity / confidence:** MEDIUM / LOW (original preserved)
- **Reason for deferral:** Refactor suggestion, not a bug. Carried from DEFER-34.
- **Exit criterion:** When a dedicated refactor/consistency pass is scheduled.

### DEFER-40: Language config table decomposition (from ARCH-2)

- **Source:** ARCH-2
- **Severity / confidence:** LOW / LOW (original preserved)
- **Citations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`
- **Reason for deferral:** Refactor suggestion. The component works correctly despite being 688 lines.
- **Exit criterion:** When a dedicated code quality/cleanup pass is scheduled.

### DEFER-41: Problem import button file size validation (from PERF-2)

- **Source:** PERF-2
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:23`
- **Reason for deferral:** The server endpoint should have its own body size limits. Client-side validation is a nice-to-have but not a security requirement.
- **Exit criterion:** When a client-side validation improvement pass is scheduled.

---

## Progress log

- 2026-04-22: Plan created from RPF cycle 12 aggregate review. 4 new tasks (H1-H2, L1-L2). 5 new deferred items (DEFER-36 through DEFER-41). All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
- 2026-04-22: H1 DONE (5891f6e5 — aria-label for icon buttons in language-config-table), H2 DONE (c56634c8 — .catch() guards on error-path res.json()), L1 DONE (681c96dd — aria-label for shortcuts-help button), L2 DONE (cc77ef05 — .catch() guard on success-path res.json() in language-config-table). All gates pass: eslint (clean), next build (success), vitest unit (2105/2105 pass), vitest component (12 pre-existing DB-dependent failures, no test files modified).
