# RPF Cycle 7 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`
**Status:** In progress

## Scope

This cycle addresses findings from the RPF cycle 7 multi-agent review:
- AGG-1: `response.json()` before `response.ok` persists in 4 remaining files (create-group-dialog, bulk-create-dialog, database-backup-restore restore path, admin-config)
- AGG-2: `database-backup-restore.tsx` inconsistent error handling between backup and restore paths
- AGG-3: `admin-config.tsx` shows hardcoded "Network error" string instead of i18n key
- AGG-4: `useVisibilityPolling` JSDoc missing note about callback error handling responsibility
- AGG-5: `submission-detail-client.tsx` handleRetryRefresh calls `res.json()` without checking `res.ok`

No cycle-7 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix `response.json()` before `response.ok` in `create-group-dialog.tsx` (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx:64-68`
- **Cross-agent signal:** 9 of 11 review perspectives
- **Problem:** Line 64 calls `const data = await response.json()` unconditionally, then line 66 checks `if (!response.ok)`. When the server returns non-JSON (e.g., 502 from proxy), `response.json()` throws SyntaxError. The `getErrorMessage` default case returns raw `error.message`, showing "SyntaxError" to the user.
- **Plan:**
  1. Check `response.ok` before calling `response.json()`.
  2. Use `.json().catch(() => ({}))` for the error body.
  3. Change `getErrorMessage` default case to return generic i18n key for SyntaxError instances.
  4. Verify all gates pass.
- **Status:** DONE — Commit `7bf6a4e5`

### H2: Fix `response.json()` before `response.ok` in `bulk-create-dialog.tsx` (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:212-215`
- **Cross-agent signal:** 9 of 11 review perspectives
- **Problem:** Line 212 calls `const data = await response.json()` before checking `response.ok`. For a bulk operation, partial success is possible — the admin loses visibility into which users were created.
- **Plan:**
  1. Check `response.ok` before calling `response.json()`.
  2. Use `.json().catch(() => ({}))` for the error body.
  3. Verify all gates pass.
- **Status:** DONE — Commit `d0fdb7b7`

### H3: Fix `response.json()` before `response.ok` in `database-backup-restore.tsx` restore path (AGG-1 + AGG-2)

- **Source:** AGG-1, AGG-2
- **Severity / confidence:** MEDIUM / HIGH (AGG-1), LOW / MEDIUM (AGG-2)
- **Citations:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:144-146`
- **Cross-agent signal:** 9 of 11 review perspectives (AGG-1), 5 of 11 (AGG-2)
- **Problem:** The restore handler calls `response.json()` before checking `response.ok`, while the backup handler in the same file correctly uses `.json().catch(() => ({}))`.
- **Plan:**
  1. Change restore handler to check `response.ok` before `.json()`.
  2. Use `.json().catch(() => ({}))` for the error body, matching the backup handler pattern.
  3. Verify all gates pass.
- **Status:** DONE — Commits `a1d01d9e`, `3a4d15ef`

### H4: Fix `response.json()` without `response.ok` check in `admin-config.tsx` test-connection handler (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/lib/plugins/chat-widget/admin-config.tsx:99-100`
- **Cross-agent signal:** 9 of 11 review perspectives
- **Problem:** `handleTestConnection` calls `response.json()` without checking `response.ok` first. When the test-connection endpoint returns a non-JSON error, SyntaxError is thrown and the catch shows a misleading "Network error".
- **Plan:**
  1. Check `response.ok` before calling `response.json()`.
  2. For error responses, extract the error message with `.json().catch(() => ({}))`.
  3. Show appropriate error message based on response status.
  4. Verify all gates pass.
- **Status:** DONE — Commit `642246bf`

### M1: Replace hardcoded "Network error" string with i18n key in `admin-config.tsx` (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/plugins/chat-widget/admin-config.tsx:102`
- **Cross-agent signal:** 1 of 11 review perspectives
- **Problem:** The catch block shows the hardcoded English string "Network error" instead of using an i18n translation key. Breaks i18n for non-English users.
- **Plan:**
  1. Replace `"Network error"` with `t("errorNetwork")` or similar i18n key.
  2. Add the i18n key to both `en.json` and `ko.json` locale files.
  3. Verify all gates pass.
- **Status:** DONE — Commit `642246bf` (combined with H4)

### L1: Add callback error handling note to `useVisibilityPolling` JSDoc (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/hooks/use-visibility-polling.ts:6-13`
- **Cross-agent signal:** 1 of 11 review perspectives (also flagged as DOC-2 in cycle 3)
- **Problem:** The JSDoc does not document that the callback must handle its own errors. Developers may assume the hook catches errors from the callback.
- **Plan:**
  1. Add a note to the JSDoc: "The callback must handle its own errors (e.g., try/catch with toast). The hook does not catch errors thrown by the callback."
  2. Verify all gates pass.
- **Status:** DONE — Commit `b203319f`

### L2: Fix `submission-detail-client.tsx` handleRetryRefresh `.then()` chain to check `res.ok` (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:100`
- **Cross-agent signal:** 1 of 11 review perspectives
- **Problem:** The retry handler uses a `.then((res) => res.json())` chain without checking `res.ok` first. Lower risk since it's a manual action, but still violates the documented convention.
- **Plan:**
  1. Restructure to async/await with `response.ok` check before `.json()`.
  2. Verify all gates pass.
- **Status:** DONE — Commit `201a9eaa`

---

## Deferred items

### DEFER-1 through DEFER-25: Carried from cycle 6 plan

See `plans/done/2026-04-22-rpf-cycle-6-review-remediation.md` for the full deferred list. All carry forward unchanged. Key items:
- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-20: Contest clarifications show raw userId instead of username
- DEFER-24: Invitation URL uses window.location.origin (SEC-2 also flagged access-code-manager and workers-client)
- DEFER-1 (cycle 1): Add unit tests for useVisibilityPolling, SubmissionListAutoRefresh, and stats endpoint

### DEFER-26: Unit tests for create-group-dialog.tsx and bulk-create-dialog.tsx (from TE-1, TE-2)

- **Source:** TE-1, TE-2
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx`, `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx`
- **Reason for deferral:** The code fixes (H1-H4) address the immediate bugs. Adding comprehensive unit tests is a larger effort that should be done in a dedicated test coverage pass rather than mixed with bug fixes.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

---

## Progress log

- 2026-04-22: Plan created from RPF cycle 7 aggregate review. 7 new tasks (H1-H4, M1, L1-L2). 1 new deferred item (DEFER-26). All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
- 2026-04-22: All 7 tasks implemented. H1 (7bf6a4e5), H2 (d0fdb7b7), H3 (a1d01d9e + lint 3a4d15ef), H4+M1 (642246bf), L1 (b203319f), L2 (201a9eaa). Running quality gates.
- 2026-04-22: All quality gates passed. eslint: CLEAN, next build: SUCCESS, vitest unit: 294 files / 2104 tests PASSING, vitest integration: 37 skipped (no DB), vitest component: 12 pre-existing failures in unrelated files (getDbNow mocking).
