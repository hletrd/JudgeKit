# test-engineer — Cycle 3 (2026-05-29)

Baseline: `vitest run` = 319 files, 2438 tests, all passing.

## TE-C3-1 [Low / High] — No test asserts the public-signup verification-dispatch failure path is observable
`tests/unit/actions/public-signup.test.ts` mocks `sendEmailVerification` as
always-resolving (per cycle-1 aggregate F6) and does not assert what happens when
the dispatch REJECTS. With the DBG-C3-3 fix (add `logger.warn` to the signup
catch), add a test: when `sendEmailVerification` rejects, (a) signup still returns
`{success:true}`, (b) a warn is logged. This locks the new observability and the
"signup never fails because of email" invariant in one test.

## TE-C3-2 [Low / Medium] — No coverage for `getPublicBaseUrl` precedence (once added)
When CR-C3-1/SEC-C3-1 lands as a centralized helper, add a unit test asserting:
canonical `AUTH_URL`/`NEXTAUTH_URL` is preferred when set; request-host fallback is
used only when unset; trailing-slash normalization. Prevents a regression back to
raw-host trust.

## TE-C3-3 [Low / Medium] — SMTP provider has no direct unit test for the retry loop / config-precedence
`smtp.ts` retry loop (transient vs terminal classification, single-rebuild) and
env-over-DB config precedence are untested in isolation. A focused test would lock
the `isTransient` predicate (ECONNRESET/ETIMEDOUT/421/"try again") and the
"env vars take precedence when all four set" branch. Carried-over F5-cycle1, OPEN.

## Confirmed-good
- HTML escaping is locked by `tests/unit/email/templates.test.ts` (cycle-1).
- The cycle-2 audit-redaction regression test (smtpPass + hcaptchaSecret →
  "••••••••") and the sendEmail cached-guard tests are present and passing
  (2438 total; +4 from the cycle-1 2434 baseline). Verified by count.

## Final sweep
The single highest-value net-new test is TE-C3-1, paired with the DBG-C3-3 fix.
TE-C3-2 is contingent on the CR-C3-1 helper landing. TE-C3-3 is a carried-over gap.
No flaky tests observed across the 2438-test run.
