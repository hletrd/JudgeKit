# Test Engineer Review — RPF Cycle 2 (2026-05-04)

**Reviewer:** test-engineer
**HEAD reviewed:** `767b1fee`

---

## Test coverage analysis

### Recent changes test coverage

#### ConditionalHeader (commit `767b1fee`)
- **Coverage:** No dedicated test for `ConditionalHeader`.
- **Risk:** LOW — Component is a simple path-based conditional renderer. Behavior is deterministic and easily verified visually.

#### i18n fixes (commit `95cbcf6a`)
- **Coverage:** `tests/unit/public-detail-seo-metadata.test.ts` updated. Existing tests cover metadata generation.
- **Status:** Adequate.

#### Discussions refactor (commit `82e1ea9e`)
- **Coverage:** Existing integration tests cover discussion thread listing. The SQL filter push-down is transparent to callers.
- **Status:** Adequate.

#### Code similarity `performance.now()` (commit `7f29d897`)
- **Coverage:** 33 unit tests exist for `normalizeSource`, `normalizeIdentifiersForSimilarity`, `jaccardSimilarity`.
- **Status:** Good coverage.

#### Recruiting validate endpoint (uncommitted)
- **Coverage:** `tests/unit/api/recruiting-validate.route.test.ts` — 4 tests covering valid, revoked, invalid, and rate-limited scenarios.
- **Status:** Good coverage.

---

## Findings

### C2-TE-1: [LOW] No unit test for ConditionalHeader component

- **File:** `src/components/layout/conditional-header.tsx`
- **Confidence:** MEDIUM
- **Description:** The new ConditionalHeader component has no dedicated test. A component test verifying the admin vs non-admin rendering branches would catch regressions.
- **Fix:** Add a component test that mocks `usePathname()` and verifies the correct header variant renders for `/dashboard/admin/*` vs other paths.
- **Exit criteria:** Component test exists covering both branches.

### C2-TE-2: [LOW] Recruiting validate test missing expired invitation case

- **File:** `tests/unit/api/recruiting-validate.route.test.ts`
- **Confidence:** LOW
- **Description:** Test covers valid, revoked, invalid token, and rate-limited scenarios. Missing: expired invitation (expiresAt in the past) and expired assignment deadline.
- **Fix:** Add test cases for expired invitation and expired assignment deadline.
- **Exit criteria:** Test suite covers the `invalid()` return path for expired invitations and deadlines.

---

## Test infrastructure health

- 379 test files across unit, integration, component, e2e, and visual suites.
- Vitest configuration appears healthy.
- No flaky test patterns detected in recent commits.
