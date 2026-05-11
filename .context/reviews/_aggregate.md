# Aggregate Review — Cycle 1 (RPF Loop)

**Date:** 2026-05-11
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, test-engineer, architect
**Scope:** New findings from this cycle's deep code review

---

## New Findings Summary (This Cycle)

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 2 |
| MEDIUM   | 2 |
| LOW      | 2 |
| **Total**| **6** |

---

## HIGH

### H1: setState in useEffect Blocking ESLint (verify-email page)
- **File:** `src/app/(auth)/verify-email/page.tsx:20-21,36-37,40,45,47-48`
- **Reviewer:** code-reviewer, perf-reviewer
- **Description:** The verify-email page calls `setStatus()` and `setErrorMessage()` directly inside `useEffect`. The `react-hooks/set-state-in-effect` ESLint rule flags this as an error. Build gates are blocked.
- **Fix:** Restructure the component to avoid setState in effect bodies. Use initial state values or callback-based flows.

### H2: Unused Import After Refactoring
- **File:** `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:9`
- **Reviewer:** code-reviewer
- **Description:** `getApiData` is imported but never used. Leftover from commit 3c8057f3 refactoring. Produces an ESLint warning.
- **Fix:** Remove unused import.

---

## MEDIUM

### M1: COMPILER_RUNNER_URL Backfill Timing in Deploy Script
- **File:** `deploy-docker.sh:453-520`
- **Reviewer:** code-reviewer, security-reviewer, architect
- **Description:** `ensure_env_literal` for COMPILER_RUNNER_URL runs before `.env.production` is transferred to remote. On first deploy, the key is never injected. Lines 514-520 only warn but do not fix.
- **Fix:** Add post-transfer backfill for COMPILER_RUNNER_URL, or source `.env.deploy.*` files before backfill.

### M2: verify-email Page Lacks Tests
- **File:** `src/app/(auth)/verify-email/page.tsx`
- **Reviewer:** test-engineer
- **Description:** New auth surface with zero test coverage. Missing tests for token absence, fetch errors, success flow, and navigation.
- **Fix:** Add component tests.

---

## LOW

### L1: Cleanup Failures Silently Swallowed
- **File:** `src/lib/compiler/execute.ts:406,418`
- **Reviewer:** code-reviewer
- **Description:** `.catch(() => {})` masks Docker cleanup failures.
- **Fix:** Log at warn level.

### L2: verify-email Token Not Client-Side Validated
- **File:** `src/app/(auth)/verify-email/page.tsx:31`
- **Reviewer:** security-reviewer
- **Description:** No client-side format validation before sending token to server.
- **Fix:** Add minimal length/format check.

---

## Cross-Agent Agreement

- **verify-email page:** code-reviewer (lint errors), perf-reviewer (cascading renders), test-engineer (missing tests), security-reviewer (input validation) — multi-agent consensus that this new surface needs attention.
- **deploy script COMPILER_RUNNER_URL:** code-reviewer, security-reviewer, architect all flagged the ordering/robustness issue.

---

## Relation to Previous Reviews

This cycle focused on recently changed surfaces (SMTP email/verification, API client refactoring, deploy script) and gate failures. Previous CRITICAL/HIGH findings (timer drift, anti-cheat, auth bypasses, SQL injection risks) were verified still resolved. No regressions detected in previously fixed areas.

---

## Recommended Priority for Fixes

1. **Immediate:** H1 — Fix verify-email setState-in-effect to unblock lint gate
2. **Immediate:** H2 — Remove unused import to clean warning
3. **Short-term:** M1 — Fix deploy script COMPILER_RUNNER_URL ordering for algo target
4. **Medium-term:** M2 — Add verify-email tests
5. **Long-term:** L1, L2 — Defensive improvements
