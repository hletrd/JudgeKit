# Test-Engineer — Cycle 2 (2026-05-29)

Scope: test-coverage gaps for net-new findings. Baseline: `npm run test:unit` =
2434 tests / 318 files, all green.

## TE-C2-1 — No test asserts `smtpPass` is redacted in the settings audit detail — Medium / High
Backs SEC-C2-1. There is no unit test that the `updateSystemSettings` audit
event masks the SMTP password. Because the redaction is an inline literal that
already missed `smtpPass`, a regression test is the durable guard.
FIX: in the system-settings action test (or a new
`tests/unit/actions/system-settings-audit.test.ts`), spy on `recordAuditEvent`
and assert `details.smtpPass === "••••••••"` (and `hcaptchaSecret` likewise) when
those fields are submitted, and that they are absent/null when not submitted.
Net-new.

## TE-C2-2 — No test for the bulk-vs-single email divergence — Low / Medium
Backs DBG-C2-2. Whichever way DBG-C2-2 is resolved (send-in-bulk or
document-no-send), a test should lock the chosen behavior so the two routes
don't silently drift again. If bulk gains sending, assert N emails are
dispatched under the concurrency cap; if not, assert zero `sendEmail` calls from
the bulk handler. Net-new.

## TE-C2-3 — No test for `sendEmail` cached-provider re-check throwing — Low / Medium
Backs DBG-C2-1. Add a unit test: prime `activeProvider` to a stub whose
`isConfigured()` rejects, call `sendEmail`, and assert it returns
`{success:false,...}` (degrades) rather than rejecting. Pairs with the
line-43 try/catch fix. Net-new.

## Final sweep
- Cycle-1's `tests/unit/email/templates.test.ts` (108 lines) and the
  `public-signup` auto-verify failure-path test (5ef18a36) are present and
  passing — F3/F6 coverage landed.
- No flaky/timing tests introduced in the cycle-1 surface.
