# Test Engineer — Cycle 22 (Fresh)

**Date:** 2026-04-20
**Base commit:** e80d2746

## Findings

### TE-1: No tests for `apiFetch` centralized wrapper [LOW/MEDIUM]

**File:** `src/lib/api/client.ts`
**Description:** The `apiFetch` function is a critical security wrapper that adds the CSRF `X-Requested-With` header to all requests. It has no unit tests. Given that 11 call sites were recently migrated to use it (cycle-21 H1), verifying its behavior with tests would prevent regressions.
**Concrete failure scenario:** A future change to `apiFetch` accidentally removes the `X-Requested-With` header. All admin mutations silently lose CSRF protection. No test catches this.
**Fix:** Add unit tests for `apiFetch`: verifies header is added when not present, preserves existing headers, does not duplicate header if already set.
**Confidence:** MEDIUM

## Verified Safe

- Unit tests exist for `formatNumber`, `formatBytes`, and `formatScore` (added in commit f8d879e9).
- ESLint and TypeScript strict mode are enabled and passing.
- No `@ts-ignore` or `@ts-expect-error` suppressions found.
