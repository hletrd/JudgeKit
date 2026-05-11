# Cycle 1 RPF Review Remediation Plan

**Date:** 2026-05-11
**Based on:** `.context/reviews/_aggregate.md` (6 findings from this cycle's deep review)
**Scope:** Fix gate-blocking lint errors, deploy script robustness, and test coverage for new auth surface.

---

## Implementation Lane 1: Gate Fixes (Blocking)

### 1.1 Fix setState in useEffect (verify-email page)
**Severity:** HIGH (blocking lint gate)
**File:** `src/app/(auth)/verify-email/page.tsx:18-53`
**Description:** `useEffect` body calls `setStatus` and `setErrorMessage` synchronously. The `react-hooks/set-state-in-effect` ESLint rule errors on this.
**Fix:**
- Option A: Move the verification logic into an async function triggered by user action (e.g., button click) instead of useEffect.
- Option B: Use initial state values to represent the "no token" condition.
- Option C: Use `useLayoutEffect` for initial state sync if the timing matters.
**Preferred:** Option A — restructure as a self-contained verification component that shows a "Verify Email" button when token is present, and an error state immediately (via initial state) when token is absent.
**Estimated effort:** 20 min
**Status:** completed (commit c04f01cc)

### 1.2 Remove unused import (assignment-form-dialog)
**Severity:** HIGH (lint warning)
**File:** `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:9`
**Description:** `getApiData` imported but never used. Leftover from commit 3c8057f3.
**Fix:** Remove `getApiData` from the import line.
**Estimated effort:** 2 min
**Status:** completed (commit 9124e9ff)

---

## Implementation Lane 2: Deploy Script Robustness

### 2.1 Fix COMPILER_RUNNER_URL backfill timing
**Severity:** MEDIUM
**File:** `deploy-docker.sh:419-520`
**Description:** `ensure_env_literal` for COMPILER_RUNNER_URL runs BEFORE `.env.production` is transferred to remote. On first deploy, the key is never injected. Also, lines 514-520 only warn but don't fix.
**Fix:** Add a post-transfer backfill step that explicitly ensures COMPILER_RUNNER_URL is present when `INCLUDE_WORKER != true`. Move the `ensure_env_literal COMPILER_RUNNER_URL` call to after the `.env.production` transfer block (after line 510), or add a second check after transfer.
**Estimated effort:** 15 min
**Status:** completed (commit c04f01cc)

---

## Implementation Lane 3: Test Coverage

### 3.1 Add component tests for verify-email page
**Severity:** MEDIUM
**File:** `src/app/(auth)/verify-email/page.tsx`
**Description:** New auth surface with zero test coverage.
**Fix:** Create `tests/component/verify-email-page.test.tsx` with tests for:
- Missing token renders error state
- Network failure renders error state
- 4xx response renders error with correct message
- 2xx response renders success state
- Navigation button pushes to /login
**Estimated effort:** 30 min
**Status:** completed (commit c76e39b7)

---

## Deferred Findings

Per repo deferred-fix rules, the following LOW severity findings are deferred:

### Deferred: Cleanup failures silently swallowed
**Severity:** LOW
**File:** `src/lib/compiler/execute.ts:406,418`
**Reason for deferral:** Cleanup failures are typically non-actionable (container already gone). Adding logging is a nice-to-have, not a correctness issue.
**Exit criterion:** Address as part of a future compiler/logging refactor.

### Deferred: verify-email token not client-side validated
**Severity:** LOW
**File:** `src/app/(auth)/verify-email/page.tsx:31`
**Reason for deferral:** Server validates the token; client-side validation is a UX optimization, not a security boundary.
**Exit criterion:** Address when the verify-email page is next touched.

---

## Acceptance Criteria

- [x] `npm run lint` passes with 0 errors, 0 warnings
- [x] `npm run build` passes
- [x] `npm run test:unit` passes (all 317 files)
- [x] deploy-docker.sh correctly injects COMPILER_RUNNER_URL on first deploy to algo target
- [x] verify-email page has component tests

---

## Deploy Status

**DEPLOY: per-cycle-success** (2026-05-11)
- All containers healthy on algo.xylolabs.com
- App responding HTTP 200
- Nginx configured for oj-internal.maum.ai

---

## Archive Notes

After all items are completed, move this plan to `plans/done/`.
