# Cycle 2 RPF Review Remediation Plan

**Date:** 2026-05-11
**Based on:** `.context/reviews/_aggregate.md` (12 findings from this cycle's deep review)
**Scope:** Fix verify-email race condition, UI/UX improvements, and logging gaps.

---

## Implementation Lane 1: Correctness & Race Conditions

### 1.1 Add AbortController to verify-email fetch (TR1)
**Severity:** MEDIUM
**File:** `src/app/(auth)/verify-email/page.tsx:27-31`
**Description:** The fetch call has no AbortController. If user navigates away, the fetch continues and may mutate state on unmounted component.
**Fix:** Add AbortController inside useEffect, pass signal to fetch, abort on cleanup.
**Estimated effort:** 10 min
**Status:** completed

---

## Implementation Lane 2: UI/UX Improvements

### 2.1 Add loading spinner to verify-email page (UI1)
**Severity:** MEDIUM
**File:** `src/app/(auth)/verify-email/page.tsx:63-65`
**Description:** Loading state shows only static text with no visual feedback.
**Fix:** Add `Loader2` spinner icon with `animate-spin` next to verifying text.
**Estimated effort:** 5 min
**Status:** completed

### 2.2 Remove nested h1 inside CardTitle (UI2)
**Severity:** MEDIUM
**File:** `src/app/(auth)/verify-email/page.tsx:58-60`
**Description:** `<h1>` is nested inside `<CardTitle>` which renders its own heading element, creating invalid heading hierarchy.
**Fix:** Remove `<h1>` wrapper, use `<CardTitle>` directly. The text is already inside CardTitle.
**Estimated effort:** 2 min
**Status:** completed

---

## Implementation Lane 3: Logging & Observability

### 3.1 Log cleanup failures instead of swallowing (L1)
**Severity:** LOW
**File:** `src/lib/compiler/execute.ts:406,418`
**Description:** `.catch(() => {})` masks Docker cleanup failures.
**Fix:** Replace with `.catch((e) => logger.warn({ err: e }, "container cleanup failed"))` using the existing pino logger.
**Estimated effort:** 5 min
**Status:** completed

---

## Deferred Findings

Per repo deferred-fix rules, the following are deferred:

### Deferred: Assignment form throw-based flow control (CR1)
**Severity:** MEDIUM
**File:** `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:278`
**Reason for deferral:** The throw is immediately caught by surrounding try/catch. Restructuring is a refactor, not a bug fix. No error reporter (Sentry) is currently configured.
**Exit criterion:** Address when adding error reporting or refactoring form submission patterns.

### Deferred: Deploy script COMPILER_RUNNER_URL backfill (M5)
**Severity:** MEDIUM
**File:** `deploy-docker.sh:419-520`
**Reason for deferral:** Already fixed in cycle 1 (commit c04f01cc). The plan from cycle 1 addressed this.
**Exit criterion:** N/A — already completed.

### Deferred: db-time.ts docstring scope (L3)
**Severity:** LOW
**File:** `src/lib/db-time.ts:45`
**Reason for deferral:** Documentation-only issue. The `Date.now()` in execute.ts is for container lifecycle, not DB timestamp comparison.
**Exit criterion:** Address during next documentation pass.

### Deferred: verify-email token client-side validation (L2)
**Severity:** LOW
**File:** `src/app/(auth)/verify-email/page.tsx:31`
**Reason for deferral:** Server validates the token; client-side check is a UX optimization.
**Exit criterion:** Address when the verify-email page is next touched.

### Deferred: verify-email buttons not disabled during loading (L4)
**Severity:** LOW
**File:** `src/app/(auth)/verify-email/page.tsx:71-76,85-90`
**Reason for deferral:** Minor UX enhancement. Buttons are not shown during loading state anyway (they're in success/error branches).
**Exit criterion:** Address when the verify-email page is next touched.

### Deferred: verify-email redirect param support (L5)
**Severity:** LOW
**File:** `src/app/(auth)/verify-email/page.tsx:13`
**Reason for deferral:** Feature request, not a bug. The current behavior (redirect to /login) is acceptable.
**Exit criterion:** Address when implementing contextual onboarding flows.

### Deferred: verify-email page tests (L6)
**Severity:** MEDIUM
**File:** `src/app/(auth)/verify-email/page.tsx`
**Reason for deferral:** Already addressed in cycle 1 (commit c76e39b7). Tests were added.
**Exit criterion:** N/A — already completed.

---

## Acceptance Criteria

- [x] `npm run lint` passes with 0 errors, 0 warnings
- [x] `npm run build` passes
- [x] `npm run test:unit` passes
- [x] verify-email fetch has AbortController
- [x] verify-email loading state shows spinner
- [x] verify-email heading hierarchy is valid
- [x] execute.ts cleanup failures are logged

---

## Deploy Status

**DEPLOY: per-cycle-success** (2026-05-11)
- All containers healthy on algo.xylolabs.com
- App responding HTTP 200
- Nginx configured for oj-internal.maum.ai

## Archive Notes

After all items are completed, move this plan to `plans/done/`.
