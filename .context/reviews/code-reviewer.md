# Code Quality and Logic Review: JudgeKit

**Reviewer:** code-reviewer
**Date:** 2026-05-11
**Scope:** Full codebase review for logic bugs, edge cases, maintainability, and correctness — Cycle 1 of RPF loop

---

## New Findings Summary

| Severity | Count |
|----------|-------|
| HIGH     | 2     |
| MEDIUM   | 1     |
| LOW      | 1     |
| **Total**| **4** |

---

## HIGH

### C1: setState in useEffect Triggers ESLint Error (verify-email page)
- **File:** `src/app/(auth)/verify-email/page.tsx:20-21,36-37,40,45,47-48`
- **Confidence:** High
- **Description:** The verify-email page (added in commit 3f634f42) calls `setStatus()` and `setErrorMessage()` directly inside the `useEffect` body. The React ESLint rule `react-hooks/set-state-in-effect` flags this because synchronous setState in effects can trigger cascading renders. This is a blocking lint error.
- **Failure scenario:** CI builds fail. On slower devices, the cascading render could cause visual flicker or jank.
- **Fix:** Restructure to initialize state via `useState` default values or use a synchronous verification handler triggered on mount instead of an effect. Alternatively, use `useLayoutEffect` for initial state sync, or compute the initial state before rendering.

### C2: Unused Import After Refactoring (assignment-form-dialog)
- **File:** `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:9`
- **Confidence:** High
- **Description:** `getApiData` is imported from `@/lib/api/client` but never used in the file. This was likely left over after the recent unsafe-cast refactoring (commit 3c8057f3). It produces an ESLint warning.
- **Fix:** Remove the unused `getApiData` from the import statement.

---

## MEDIUM

### C3: COMPILER_RUNNER_URL Backfill Timing Issue in deploy-docker.sh
- **File:** `deploy-docker.sh:419-456,502-520`
- **Confidence:** Medium
- **Description:** `ensure_env_literal` for `COMPILER_RUNNER_URL` runs BEFORE the `.env.production` file is transferred to the remote host (line 505-509). On first deploy to a fresh target, `ensure_env_literal` sees no file and returns early. Then `.env.production` is transferred (without COMPILER_RUNNER_URL because the repo's `.env.production` doesn't contain it). The key is never backfilled. On subsequent deploys it works because the file exists. Also, lines 514-520 only warn but don't auto-fix the value.
- **Failure scenario:** First deploy to algo.xylolabs.com fails because the app container cannot reach the judge worker — COMPILER_RUNNER_URL is unset or points to the wrong default.
- **Fix:** Move `ensure_env_literal COMPILER_RUNNER_URL` to run AFTER `.env.production` transfer, or ensure `.env.deploy.algo` is sourced into the script before `ensure_env_literal` runs. Alternatively, add a post-transfer backfill step.

---

## LOW

### C4: `.catch(() => {})` Patterns Still Present in Cleanup Code
- **File:** `src/lib/compiler/execute.ts:406,418`
- **Confidence:** Low
- **Description:** Container cleanup failures are silently swallowed. While cleanup failures are typically non-actionable, they can mask disk-pressure or Docker daemon issues.
- **Fix:** Log cleanup failures at debug/warn level rather than swallowing them entirely.

---

## Cross-File Observations

- The `apiFetchJson` / `getApiError` / `getApiData` refactoring in commit 3c8057f3 was broadly correct but left behind one unused import (C2).
- The verify-email page is a new surface added in the SMTP feature commit; it should have been linted before merge.
- The deploy script's `ensure_env_literal` pattern works for keys that already exist in the repo `.env.production` but breaks for target-specific overrides that are meant to be injected.
