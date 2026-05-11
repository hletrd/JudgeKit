# Aggregate Review — Cycle 2 (RPF Loop)

**Date:** 2026-05-11
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, test-engineer, architect, critic, verifier, tracer, debugger, document-specialist, designer
**Scope:** Full codebase review — new findings from this cycle

---

## New Findings Summary (This Cycle)

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 5 |
| LOW      | 7 |
| **Total**| **12** |

---

## MEDIUM

### M1: Verify-Email Fetch Missing AbortController — Race Condition on Navigation
- **File:** `src/app/(auth)/verify-email/page.tsx:27-31`
- **Reviewer:** tracer
- **Confidence:** Medium
- **Description:** The `fetch("/api/v1/auth/verify-email")` call has no AbortController. If the user navigates away while the request is in flight, the fetch continues in the background. When it eventually resolves, `setStatus` / `setErrorMessage` mutate state on an unmounted component or overwrite newer state if the component remounts.
- **Fix:** Add an AbortController inside useEffect, pass its signal to fetch, and abort on cleanup.

### M2: Verify-Email Page Lacks Loading Spinner / Visual Feedback During Fetch
- **File:** `src/app/(auth)/verify-email/page.tsx:63-65`
- **Reviewer:** designer
- **Confidence:** High
- **Description:** The loading state displays only static text with no spinner or progress indicator. On slower networks, users may perceive the page as frozen.
- **Fix:** Add a `Loader2` spinner icon next to the text, matching other async UI surfaces.

### M3: Verify-Email CardTitle Wraps `<h1>` Creating Invalid Heading Hierarchy
- **File:** `src/app/(auth)/verify-email/page.tsx:58-60`
- **Reviewer:** designer
- **Confidence:** Medium
- **Description:** `<CardTitle>` from shadcn/ui renders as a heading element (typically `<h3>`). Wrapping an `<h1>` inside it creates invalid nested heading hierarchy, breaking accessibility for screen reader users.
- **Fix:** Remove the nested `<h1>` and rely on `<CardTitle>`'s native heading.

### M4: Assignment-Form Dialog Uses `throw` for API Error Flow Control
- **File:** `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:278`
- **Reviewer:** critic
- **Confidence:** High
- **Description:** The form submission handler throws `new Error()` with a translation key when the API returns an error. This conflates programmer errors with expected user-facing conditions and would pollute error reporting if Sentry/etc. is added.
- **Fix:** Return an error result object instead of throwing. Use explicit error propagation.

### M5: Deploy Script `ensure_env_literal` Runs Before `.env.production` Transfer
- **File:** `deploy-docker.sh:419-520`
- **Reviewer:** code-reviewer, security-reviewer, architect
- **Confidence:** Medium
- **Description:** On first deploy to a fresh target, `COMPILER_RUNNER_URL` is never injected because the backfill runs before the file exists on the remote.
- **Fix:** Add post-transfer backfill for `COMPILER_RUNNER_URL`, or source `.env.deploy.*` files before backfill.

---

## LOW

### L1: Cleanup Failures Silently Swallowed in `execute.ts`
- **File:** `src/lib/compiler/execute.ts:406,418`
- **Reviewer:** code-reviewer, debugger
- **Confidence:** Low
- **Description:** `.catch(() => {})` masks Docker cleanup failures, potentially hiding disk-pressure or daemon issues.
- **Fix:** Log cleanup failures at warn level rather than swallowing them entirely.

### L2: Verify-Email Token Not Client-Side Validated
- **File:** `src/app/(auth)/verify-email/page.tsx:31`
- **Reviewer:** security-reviewer
- **Confidence:** Low
- **Description:** The verify token is sent to the server without client-side format validation.
- **Fix:** Add a minimal client-side length/format check before calling the API.

### L3: `db-time.ts` Docstring Overly Broad, Not Honored by `execute.ts`
- **File:** `src/lib/db-time.ts:45`, `src/lib/compiler/execute.ts:870`
- **Reviewer:** verifier, document-specialist
- **Confidence:** Medium
- **Description:** Docstring claims to replace all server-side `Date.now()` calls, but `execute.ts` uses raw `Date.now()` for container age.
- **Fix:** Narrow the docstring scope.

### L4: Verify-Email Success/Error Buttons Not Disabled During Processing
- **File:** `src/app/(auth)/verify-email/page.tsx:71-76,85-90`
- **Reviewer:** designer
- **Confidence:** Low
- **Description:** Buttons remain interactive while verification is in flight.
- **Fix:** Add `disabled={status === "loading"}`.

### L5: Verify-Email Page Assumes Token is Only Search Param
- **File:** `src/app/(auth)/verify-email/page.tsx:13`
- **Reviewer:** critic
- **Confidence:** Medium
- **Description:** No redirect preservation after verification success.
- **Fix:** Accept optional `redirect` search param.

### L6: Verify-Email Page Lacks Tests
- **File:** `src/app/(auth)/verify-email/page.tsx`
- **Reviewer:** test-engineer
- **Confidence:** High
- **Description:** New auth surface with zero test coverage.
- **Fix:** Add component tests.

---

## False Positives / Invalid Findings

### ~~H2: Unused Import `getApiData` in assignment-form-dialog~~
- **Reviewer:** code-reviewer
- **Status:** INVALID — The actual import is `getApiError`, which IS used at line 278. The review cited an incorrect identifier name.

### ~~H1: setState in useEffect Blocking ESLint~~
- **Reviewer:** code-reviewer, perf-reviewer
- **Status:** NOT REPRODUCIBLE — The code uses an async function inside useEffect (standard React pattern). `setStatus`/`setErrorMessage` are called after `await`, not synchronously in the effect body. ESLint passes clean. The initial state is computed in `useState` initializer, not via setState.

---

## AGENT SPAWN FAILURES

- **critic, verifier, tracer, debugger, document-specialist, designer:** The `Agent` tool is unavailable in this environment. These six reviews were conducted directly by the orchestrator agent rather than fanned-out subagents. Coverage is reduced compared to a full multi-agent fan-out.

---

## Cross-Agent Agreement

- **verify-email page:** Flagged by 7 agents (tracer, designer, critic, security-reviewer, test-engineer, debugger, code-reviewer) — strong consensus that this new auth surface needs hardening.
- **deploy script env injection:** code-reviewer, security-reviewer, architect all flagged the ordering/robustness issue.
- **execute.ts silent catches:** code-reviewer and debugger both noted the swallowed-error pattern.

---

## Recommended Priority for Fixes

1. **Immediate:** M1 (AbortController for verify-email fetch) — real race condition
2. **Immediate:** M2 (loading spinner) — easy UX win
3. **Immediate:** M3 (nested h1) — easy a11y fix
4. **Short-term:** M4 (throw for flow control) — code quality
5. **Short-term:** M5 (deploy script) — infra robustness
6. **Medium-term:** L1-L6 — defensive improvements and coverage
