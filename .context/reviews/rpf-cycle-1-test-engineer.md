# Test Engineer Review — RPF Cycle 1 (2026-05-01)

**Reviewer:** test-engineer
**HEAD reviewed:** `894320ff`

---

## Test surface scan

- vitest configs: `vitest.config.ts`, `vitest.config.integration.ts`, `vitest.config.component.ts`
- security tests: `tests/unit/security/`
- playwright configs: `playwright.config.ts`, `playwright.visual.config.ts`
- Component tests: 30+ files in `tests/component/`

---

## Findings

### C1-TE-1: [MEDIUM] No test enforces AGENTS.md password policy

- **File:** Test coverage for `src/lib/security/password.ts`
- **Confidence:** HIGH
- **Description:** The existing tests for `getPasswordValidationError` validate the current behavior (including common-password rejection and username/email similarity checks). However, there is no test that asserts the documented AGENTS.md policy: "Password validation MUST only check minimum length." If the policy is the source of truth, the tests are testing the wrong behavior. If the code is the source of truth, the documentation is wrong.
- **Fix:** After resolving the policy-code mismatch (C1-CR-1), update the tests to match the chosen source of truth.

### C1-TE-2: [LOW] `getAssignmentStatusRows` has no integration test for the raw SQL aggregation

- **File:** `src/lib/assignments/submissions.ts:562-601`
- **Confidence:** MEDIUM
- **Description:** The complex raw SQL query in `getAssignmentStatusRows` (CTE with `ROW_NUMBER`, late penalty CASE expression, GROUP BY aggregation) is a critical scoring path. There is no integration test that validates the scoring output against known inputs. Unit tests may mock the DB, but the raw SQL itself is untested against a real PostgreSQL instance.
- **Fix:** Add an integration test under `tests/integration/` that seeds a known assignment with submissions and verifies the aggregated status rows match expected scores, especially for late-penalty edge cases.

### C1-TE-3: [LOW] Playwright e2e gate depends on browser availability

- **Confidence:** HIGH (carry-forward from prior cycles)
- **Description:** If `playwright install` has not been run, e2e tests cannot execute. This is a known environment dependency, not a code issue.
- **Fix:** Record as a deferred gate caveat.
