# Cycle 26 Critic Review

**Date:** 2026-04-20
**Base commit:** 660ae372

---

## CRI-1: Failing test is a blocking gate issue — must be fixed before any deploy [HIGH/HIGH]

**Files:** `tests/unit/recruit-page-metadata.test.ts:42`
**Description:** The vitest suite has 1 consistently failing test. This is the highest-priority issue because it blocks CI. The test timeout suggests a mock isolation problem with dynamic `import()` in Vitest. The fix is straightforward — use static imports or fix the mock setup.
**Fix:** Fix the test (see TE-1 for details).

## CRI-2: ESLint warnings on `_total` destructuring should be resolved [MEDIUM/MEDIUM]

**Files:** `src/app/api/v1/files/route.ts:191`, `src/app/api/v1/submissions/route.ts:136`, `src/app/api/v1/users/route.ts:50`
**Description:** Three eslint warnings for unused `_total` variables. While these are warnings not errors, they represent technical debt that will block a strict `--max-warnings=0` gate. The pattern `({ _total, ...rest }) => rest` is idiomatic for stripping a field, but ESLint doesn't recognize it.
**Fix:** Configure eslint to ignore `_`-prefixed destructured variables, or use the explicit ignore pattern `({ _total: _, ...rest }) => rest`.

## CRI-3: Duplicate invitation query is a quality concern beyond just performance [MEDIUM/MEDIUM]

**Files:** `src/app/(auth)/recruit/[token]/page.tsx:19,56`
**Description:** Beyond the performance concern (PERF-1), having two separate calls to `getRecruitingInvitationByToken` in the same page is a correctness risk. If the invitation state changes between the two calls (e.g. someone revokes the token between metadata generation and page rendering), the user could see a page with metadata that contradicts the page content. The fix (deduplication via `React.cache()`) also ensures consistency.
**Fix:** Deduplicate the query call via `React.cache()` or a shared data-fetching pattern.

---

## Overall assessment

The codebase is in good shape after 25 cycles of review-remediation. The remaining issues are: one failing test, three eslint warnings, a duplicate DB query, and minor tracking class inconsistencies. No security vulnerabilities or data-loss risks were found.
