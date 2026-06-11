# Cycle 50 — Test Engineer

**Date:** 2026-05-13
**HEAD reviewed:** `898684e6`
**Prior aggregate:** `_aggregate-cycle-49.md` (HEAD `17a35892`)

## Scope
Test coverage and quality review of changes since cycle 49.

---

## NEW Findings

### C50-TE-1: Component test failure — verify-email-page
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `tests/component/verify-email-page.test.tsx:65`
- **Problem:** Test assertion `expect(global.fetch).toHaveBeenCalledWith(...)` does not include the `signal` property that the page component's `AbortController` passes to `fetch()`. Vitest's `toHaveBeenCalledWith` performs strict equality, so the assertion fails.
- **Error output:**
  ```
  expect(global.fetch).toHaveBeenCalledWith("/api/v1/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "valid-token" }),
  });
  ```
  Actual call includes `signal: AbortSignal { ... }`.
- **Fix:** Update the test assertion to expect `signal: expect.any(AbortSignal)` or use `expect.objectContaining()`.

### C50-TE-2: Missing tests for new rate-limited endpoints
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Files:** `src/app/api/v1/auth/verify-email/route.ts`, `src/app/api/v1/auth/reset-password/route.ts`, `src/app/api/v1/groups/[id]/assignments/route.ts`, `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
- **Problem:** No unit or component tests verify the rate-limit behavior (429 response) of these newly rate-limited endpoints.
- **Fix:** Add route-level unit tests mocking the rate limiter to verify 429 responses are returned when limits are exceeded.

### C50-TE-3: Missing tests for cursor pagination edge case
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/(public)/submissions/page.tsx`
- **Problem:** No tests verify the cursor pagination behavior when multiple submissions share the same `submittedAt` timestamp.
- **Fix:** Add unit tests for cursor encoding/decoding and same-timestamp handling.

---

## Test Results
- **Unit tests:** 317 files passed, 2401 tests passed.
- **Component tests:** 68 files passed, 214 tests passed; 1 file failed (verify-email-page), 1 test failed.
- **Lint:** Passed (eslint clean).
- **Build:** Passed (Next.js build successful).

## Carry-forward
- No new flaky test patterns observed.
- The `similarity-check.route.test.ts` still takes ~30s (known long-running test with explicit timeout).
