# Cycle 11 Test Engineer Report

**Reviewer:** test-engineer
**Date:** 2026-04-19
**Base commit:** 6c99b15c
**Scope:** Test coverage gaps, flaky tests, TDD opportunities

## Inventory of Test Files Reviewed

- `tests/` directory structure
- `vitest.config.ts`, `vitest.config.component.ts`, `vitest.config.integration.ts`
- `playwright.config.ts`, `playwright.visual.config.ts`
- `tests/unit/auth/session-security.test.ts`
- `tests/unit/api/tags-route.test.ts`

## Findings

### CR11-TE1 — [MEDIUM] No unit test verifying `AUTH_TOKEN_FIELDS` covers all fields set by `syncTokenWithUser`

- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR11-CR2, security-reviewer CR11-SR2
- **File:** `src/lib/auth/session-security.ts`, `src/lib/auth/config.ts`
- **Evidence:** `syncTokenWithUser` sets 18 fields on the JWT token. `AUTH_TOKEN_FIELDS` lists 21 fields (including `sub`, `authenticatedAt`, `uaHash`). But there is no test that verifies the two sets are consistent. If a new field is added to `syncTokenWithUser` but not to `AUTH_TOKEN_FIELDS`, no test would catch the omission. The cycle 10 test update (commit 8ecb7d1c) added tests for `clearAuthToken` with `authenticatedAt = 0`, but not for field-list consistency.
- **Failure scenario:** Developer adds `preferredEditorLayout` to `syncTokenWithUser` and `mapUserToAuthFields` but forgets `AUTH_TOKEN_FIELDS`. After token revocation, `preferredEditorLayout` survives in the JWT. No test catches it.
- **Suggested fix:** Add a unit test that: (1) creates a mock JWT, (2) calls `syncTokenWithUser` to set all fields, (3) calls `clearAuthToken`, (4) asserts that all fields set by `syncTokenWithUser` are now `undefined`. This test should be updated whenever a new auth field is added.

### CR11-TE2 — [MEDIUM] No test for `mapUserToAuthFields` producing same fields as `authorize()` inline object

- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-10 test-engineer CR10-TE2
- **File:** `src/lib/auth/config.ts`
- **Evidence:** The `authorize()` function constructs an `AuthUserRecord` inline (line 317-336) that should match the fields expected by `mapUserToAuthFields`. But there is no test that compares the inline object's keys with `mapUserToAuthFields`'s output keys. The `acceptedSolutionsAnonymous` bug was not caught by tests because no such test existed.
- **Suggested fix:** Add a unit test that constructs an `AuthUserRecord` via `mapUserToAuthFields` and verifies that all fields expected by the session/token system are present.

### CR11-TE3 — [LOW] Missing route-level tests for internal cleanup endpoint

- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-10 test-engineer CR10-TE4
- **File:** `src/app/api/internal/cleanup/route.ts`
- **Evidence:** The cleanup endpoint has no route-level tests. While it's an internal endpoint, it modifies data (deletes old events). A test should verify that: (1) valid CRON_SECRET is accepted, (2) invalid CRON_SECRET is rejected, (3) missing CRON_SECRET returns 503, (4) legal hold prevents cleanup.
- **Suggested fix:** Add route-level tests that mock `cleanupOldEvents` and verify auth and legal hold behavior.

## Previously Identified Gaps (Still Open)

- Files GET (list) route: no tests
- Groups/[id]/assignments route: no tests
- Admin backup/restore/migrate routes: no tests
- Playground run endpoint: no route-level tests (from cycle 9)
- SSE re-auth behavior: no integration tests (from cycle 9)
