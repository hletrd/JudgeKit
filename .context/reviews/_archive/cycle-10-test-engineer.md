# Cycle 10 Test Engineer Report

**Reviewer:** test-engineer
**Date:** 2026-04-19
**Base commit:** 56e78d62
**Scope:** Test coverage gaps, flaky tests, TDD opportunities

## Inventory of Test Files Reviewed

- `tests/` directory structure
- `vitest.config.ts`, `vitest.config.component.ts`, `vitest.config.integration.ts`
- `playwright.config.ts`, `playwright.visual.config.ts`
- `src/lib/security/__tests__/rate-limit.test.ts`

## Findings

### CR10-TE1 — [MEDIUM] No unit test verifying `clearAuthToken` clears all fields set by `syncTokenWithUser`

- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR10-CR2, security-reviewer CR10-SR1
- **File:** `src/lib/auth/session-security.ts`, `src/lib/auth/config.ts`
- **Evidence:** `syncTokenWithUser` sets 17 fields on the JWT token. `clearAuthToken` deletes 17 fields. But there is no test that verifies the two field sets match. If a new field is added to one but not the other, no test would catch the omission. This is especially critical given CR10-CR2 (no compile-time enforcement).
- **Failure scenario:** Developer adds `preferredEditorLayout` to `syncTokenWithUser` and `mapUserToAuthFields` but forgets `clearAuthToken`. After token revocation, `preferredEditorLayout` survives in the JWT. No test catches it.
- **Suggested fix:** Add a unit test that: (1) creates a mock JWT, (2) calls `syncTokenWithUser` to set all fields, (3) calls `clearAuthToken`, (4) asserts that all fields set by `syncTokenWithUser` are now `undefined`. This test should be updated whenever a new auth field is added.

### CR10-TE2 — [MEDIUM] No test for `mapUserToAuthFields` producing same fields as `authorize()` inline object

- **Confidence:** HIGH
- **Cross-agent agreement:** verifier CR10-V4
- **File:** `src/lib/auth/config.ts`
- **Evidence:** The `authorize()` function constructs an `AuthUserRecord` inline (line 280-296) that should match the fields expected by `mapUserToAuthFields`. But `acceptedSolutionsAnonymous` is missing from the inline object (CR10-V4). No test catches this because there is no test that compares the inline object's keys with `mapUserToAuthFields`'s output keys.
- **Suggested fix:** Add a unit test that constructs an `AuthUserRecord` via `mapUserToAuthFields` and verifies that all fields expected by the session/token system are present.

### CR10-TE3 — [LOW] No test for `PublicHeader` capability-based filtering vs `AppSidebar` capability filtering consistency

- **Confidence:** MEDIUM
- **File:** `src/components/layout/public-header.tsx`, `src/components/layout/app-sidebar.tsx`
- **Evidence:** `PublicHeader` uses hardcoded role checks, `AppSidebar` uses capability-based filtering. There is no test that verifies the two components show the same navigation items for a given set of capabilities. This could lead to diverging navigation (CR10-CT2).
- **Suggested fix:** Add component tests that render both `PublicHeader` and `AppSidebar` with the same capabilities and verify they show consistent navigation items.

### CR10-TE4 — [LOW] Missing route-level tests for internal cleanup endpoint

- **Confidence:** HIGH
- **File:** `src/app/api/internal/cleanup/route.ts`
- **Evidence:** The cleanup endpoint has no route-level tests. While it's an internal endpoint, it modifies data (deletes old events). A test should verify that: (1) valid CRON_SECRET is accepted, (2) invalid CRON_SECRET is rejected, (3) missing CRON_SECRET returns 503, (4) legal hold prevents cleanup.
- **Suggested fix:** Add route-level tests that mock `cleanupOldEvents` and verify auth and legal hold behavior.

## Previously Identified Gaps (Still Open)

- Files GET (list) route: no tests
- Groups/[id]/assignments route: no tests
- Admin backup/restore/migrate routes: no tests
- Playground run endpoint: no route-level tests (from cycle 9)
- SSE re-auth behavior: no integration tests (from cycle 9)
