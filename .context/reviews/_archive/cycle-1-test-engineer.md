# RPF Loop Cycle 1 — Test Engineer Review (2026-05-03)

**HEAD reviewed:** `37a4a8c3` (main)
**Reviewer:** test-engineer

## Summary
Gate run reveals **28 failing tests across 22 test files**. ESLint, bash lint, and tsc (`tsc --noEmit`) all pass. The unit-test gate is the blocker: many of the failures trace to legitimate behaviour changes the source moved to but the tests were never realigned.

## NEW findings

### TE-1: [HIGH] tests/unit/users/core.test.ts — `validateAndHashPassword` test calls 2-arg form, source is 1-arg

- **File:** `tests/unit/users/core.test.ts:200, 220-221` and `src/lib/users/core.ts:55-63`
- **Description:** The test passes `validateAndHashPassword("StrongPass1!", { username: "alice" })` and asserts that `getPasswordValidationError` was called with `("Password1!", ctx)`. But the source code at line 55-63 only accepts one parameter `password` and calls `getPasswordValidationError(password)` with one arg. tsc errors confirm: TS2554 "Expected 1 arguments, but got 2" at lines 200 and 220.
- **Confidence:** HIGH (verified by source, type checker, and live test failure)
- **Failure scenario:** CI gate blocks all merges. Type-check passes only because tests are excluded from `tsc --noEmit` paths.
- **Fix:** Update the test to drop the 2nd argument and update the assertion to `expect(mocks.getPasswordValidationError).toHaveBeenCalledWith("Password1!")`.

### TE-2: [HIGH] tests/unit/actions/change-password.test.ts — same context-arg drift

- **File:** `tests/unit/actions/change-password.test.ts:237-249`
- **Description:** Test "passes correct context to getPasswordValidationError" expects `getPasswordValidationError` to be called with `("StrongNewPass1", { username: "testuser", email: "test@example.com" })` but the production code in `src/lib/actions/change-password.ts:60` calls `getPasswordValidationError(newPassword)` with one arg.
- **Confidence:** HIGH
- **Fix:** Either delete the test or align it to the new 1-arg API: `expect(mocks.getPasswordValidationError).toHaveBeenCalledWith("StrongNewPass1")`.

### TE-3: [HIGH] tests/unit/judge/auth.test.ts — "falls back to the shared token" test contradicts hardening

- **File:** `tests/unit/judge/auth.test.ts:154-162`
- **Description:** The test expects `isJudgeAuthorizedForWorker()` to return `{ authorized: true }` when the worker doesn't exist (DB returns null) and the request bears a valid shared `JUDGE_AUTH_TOKEN`. But the new source (commit `909fcbf5`) explicitly removed that fallback: `auth.ts:70-80` returns `{ authorized: false, error: "workerNotFound" }` when the worker is missing. The test is asserting the old behaviour.
- **Confidence:** HIGH
- **Severity rationale:** Security regression risk — if anyone "fixes" the test by re-enabling fallback, they reintroduce the shared-token escalation path. Must NOT be reverted.
- **Fix:** Update the test to assert `{ authorized: false, error: "workerNotFound" }`. Also rename the test name accordingly.

### TE-4: [HIGH] tests/unit/validators/groups.test.ts — `bulkEnrollmentSchema` max raised, test stale

- **File:** `tests/unit/validators/groups.test.ts:178-188`
- **Description:** Test "rejects more than 200 userIds" expects rejection at 201. Source `src/lib/validators/groups.ts:29-30` now permits up to 500. Likewise "accepts exactly 200 userIds" is no longer a meaningful boundary.
- **Confidence:** HIGH
- **Fix:** Update boundary to 500/501 in both tests, or replace with parameterized boundary test using `bulkEnrollmentSchema._def`.

### TE-5: [HIGH] tests/unit/capabilities/defaults.test.ts — `assistant extends student capabilities without full instructor access`

- **File:** `tests/unit/capabilities/defaults.test.ts` and `src/lib/capabilities/defaults.ts:15-34`
- **Description:** `ASSISTANT_CAPABILITIES` was deliberately reduced — `submissions.view_all` was removed (commit `246822fa fix(capabilities): scope assistant role to assigned groups`). The test still asserts the broader set.
- **Confidence:** HIGH
- **Fix:** Update assertion list to match the post-`246822fa` capability set.

### TE-6: [HIGH] tests/unit/capabilities/cache.test.ts — `bootstraps all built-in roles, including assistant, when the DB is empty`

- **File:** `tests/unit/capabilities/cache.test.ts`
- **Description:** Same root cause as TE-5. Cache test asserts the historical `assistant` capability bag rather than the scoped one. Probably comparing literal strings or counts.
- **Confidence:** MEDIUM (didn't read full assertion, but same scope reduction)
- **Fix:** Realign expected capability set.

### TE-7: [MEDIUM] tests/unit/judge/ip-allowlist.test.ts — `matches IPv6 exact addresses but not IPv6 CIDR`

- **File:** `tests/unit/judge/ip-allowlist.test.ts`
- **Description:** Commit `12417fa9 fix(judge): add IPv6 CIDR support to JUDGE_ALLOWED_IPS` added IPv6 CIDR matching. The test asserting "does NOT match IPv6 CIDR" is now stale — it should now assert that IPv6 CIDR DOES match.
- **Confidence:** HIGH
- **Fix:** Flip the assertion — IPv6 CIDR must now match. Also add positive cases for `::1/128`, `2001:db8::/32`, and a non-matching `2001:db8:1::/48` vs `2001:db9::1` mismatch.

### TE-8: [MEDIUM] tests/unit/api/group-members-bulk.route.test.ts — 2 failures

- **File:** `tests/unit/api/group-members-bulk.route.test.ts`
- **Description:** Bulk-enrollment route now accepts `usernames` as well as `userIds` (commit `3b416d56 feat(groups): bulk-enroll students from a pasted username list`). Two tests fail:
  - "counts skipped users from duplicate requests, invalid ids, and insert conflicts" — likely missing the new `unresolvedUsernames` / `nonStudentUsernames` fields in the response shape.
  - "skips the full request when no valid students remain after validation" — likely uses the old shape.
- **Confidence:** MEDIUM (didn't read test source)
- **Fix:** Update mock expectations to include the new response fields.

### TE-9: [MEDIUM] tests/unit/hooks/use-source-draft.test.ts — 3 hydration failures (failure listed twice = same 3 cases)

- **File:** `tests/unit/hooks/use-source-draft.test.ts`
- **Description:** 3 tests fail repeatedly:
  - "hydrates stored drafts and preferred language after mount without marking the form dirty"
  - "preserves hydrated drafts when persisting after mount"
  - "does not drop unsaved draft state when the languages prop is recreated with the same values"
  No commit in the recent log obviously touches `use-source-draft`, so this may be a flaky React 19 / `act`-warning regression or an upstream change. Needs investigation.
- **Confidence:** LOW (root cause not yet identified)
- **Fix:** Read each failure assertion; check whether `react@19.2.5` upgrade or `setIsDirty` timing changed.

### TE-10: [MEDIUM] tests/unit/infra/deploy-security.test.ts — 3 failures

- **File:** `tests/unit/infra/deploy-security.test.ts`
- **Description:** Compose / deploy contract tests fail:
  - "keeps the rate-limiter sidecar off the host network and disables reset"
  - "wires sidecar bearer tokens into the compose services that enforce them"
  - "keeps upload persistence and docker-proxy capabilities aligned with the admin deployment contract"
  Likely cause: `docker-compose.production.yml` or `deploy-docker.sh` fingerprints drifted from the literal expectations.
- **Confidence:** MEDIUM (didn't read assertions)
- **Fix:** Identify which section of compose/deploy changed; update test expectations.

### TE-11: [MEDIUM] Various `*-implementation.test.ts` source-grep guards

- **Files:**
  - `tests/unit/custom-role-pages-implementation.test.ts`
  - `tests/unit/ui-i18n-keys-implementation.test.ts`
  - `tests/unit/mobile-ui-layout-implementation.test.ts`
  - `tests/unit/problem-page-anti-cheat-implementation.test.ts`
  - `tests/unit/api/recruiting-candidate-isolation-implementation.test.ts` (×2)
  - `tests/unit/assignment-context-requirement-implementation.test.ts`
  - `tests/unit/ui-hardcoded-strings-implementation.test.ts`
  - `tests/unit/lecture-stats-wiring-implementation.test.ts`
  - `tests/unit/problem-page-scroll-layout-implementation.test.ts`
  - `tests/unit/infra/source-grep-inventory.test.ts`
  - `tests/unit/personal-submissions-page-implementation.test.ts`
  - `tests/unit/problem-rankings-page.test.ts`
- **Description:** These are source-grep / structural tests that verify "this UI surface contains literal pattern X". Multiple recent commits refactored UI (mobile layout md→lg breakpoint, locale switcher, public-header changes) and the literal patterns in these tests are no longer present.
- **Confidence:** MEDIUM (12 separate tests; root cause varies but pattern is the same)
- **Fix:** For each test, read the assertion, identify the new literal pattern in the refactored source, update.
- **Process note:** When a refactor happens, source-grep tests must be updated in the same commit. This drift is a process gap.

### TE-12: [MEDIUM] tests/unit/mobile-ui-layout-implementation.test.ts — md → lg breakpoint drift

- **File:** `tests/unit/mobile-ui-layout-implementation.test.ts:* > "uses a collapsible mobile public header with truncated site title"`
- **Description:** Specific subset of TE-11. Commit `37a4a8c3 fix(layout): push public-header desktop nav from md: to lg: breakpoint` changed the responsive breakpoint from `md:` to `lg:` in `src/components/layout/public-header.tsx:178, 197, 246, 275, 277`. Test asserting old `md:hidden` class is now stale.
- **Confidence:** HIGH
- **Fix:** Update class-name regexes from `md:` to `lg:`.

## Coverage gaps (not failures, but gaps)

### TE-13: [LOW] No test for `recruit/[token]/results/page.tsx` totalScore semantics

- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:183-191` (see code-reviewer CR-1)
- **Description:** The total score arithmetic mixes raw `score` (percentage 0-100) and per-problem `points` scaling. A regression test would catch the bug.
- **Confidence:** MEDIUM
- **Fix:** Add a unit test that asserts the displayed total reconciles with the per-problem rendered score.

### TE-14: [LOW] `pre-restore-snapshot.ts` has no unit test

- **File:** `src/lib/db/pre-restore-snapshot.ts`
- **Description:** New module added by `a055f166 feat(restore): take server-side pre-restore snapshot before import`. Covers a destructive-action path; deserves test coverage of the prune logic (RETAIN_LAST_N) and snapshot file naming.
- **Confidence:** MEDIUM
- **Fix:** Add unit tests with `mock-fs` or `tmpdir` covering: (1) snapshot is created; (2) older snapshots are pruned; (3) directory creation failure returns null.

## Final-sweep checklist

- [x] Re-read `tests/unit/**` failures from a fresh `npm run test:unit` invocation.
- [x] Cross-referenced each failure against `git log` since the cycle-3 aggregate (HEAD `894320ff` → `37a4a8c3`).
- [x] Confirmed `tsc --noEmit` errors at `tests/unit/users/core.test.ts:200, 220` block compilation (will block `next build` if test files are included).
- [x] Confirmed `npm run lint` passes (eslint clean).
- [x] Confirmed `npm run lint:bash` passes.
- [x] No new test files were added that don't belong (only `tests/unit/docker/client.test.ts` and `tests/unit/assignments/participant-status.test.ts` from the recent batch — both pass).
