# Test Coverage Review — Cycle 1 (2026-05-29)

## Findings

### TE-C1-1 — No tests for email HTML escaping (security-relevant) [Medium / High confidence]
File under test: `src/lib/email/templates.ts` (escapeHtml + 4 render functions).
Searched `tests/**`: only `tests/unit/actions/public-signup.test.ts`,
`tests/component/verify-email-page.test.tsx`, and
`tests/unit/auth/email-identity-implementation.test.ts` reference email at all. None
exercise `escapeHtml` or any `render*Email` function. The escaping added in commit
6e1ea706 is exactly the kind of security logic that should be regression-locked: a
future refactor could drop the escape on `candidateName`/`assessmentTitle`/`details`
and re-introduce HTML injection into emails with no failing test.
Fix: add `tests/unit/email/templates.test.ts` asserting that `<script>`, `&`, `"`,
`'`, `<`, `>` in `candidateName`, `assessmentTitle`, `title`, `details` are escaped in
the `html` output (and that the `text` output is the raw value). Also assert the
recruiting subject contains the title and the expiry date formatting branch
(expiresAt null vs set).

### TE-C1-2 — No tests for SMTP provider retry / config-decrypt logic [Low / Medium confidence]
File under test: `src/lib/email/providers/smtp.ts`.
The transient-failure retry loop (codes ECONNRESET/ETIMEDOUT/etc., "421 ", "try again")
and the `getSmtpConfig` env-vs-DB precedence + decrypt are untested. A mocked
nodemailer transport could verify: (a) one retry on a transient error then success,
(b) no retry on a permanent error, (c) decrypt is called with plaintext fallback so a
legacy plaintext password does not throw (ties to SEC-C1-1).
Confidence Medium: meaningful coverage gap, but lower priority than TE-C1-1.

### TE-C1-3 — public-signup auto-verify email path untested [Low / Medium confidence]
File: `src/lib/actions/public-signup.ts:191-199`. The new fire-and-forget
`sendEmailVerification` call has a `.catch(() => {})`. The existing
`tests/unit/actions/public-signup.test.ts` was updated (+13 lines) but should assert
that signup still returns `{ success: true }` when the email send rejects, and that
`sendEmailVerification` is invoked only when `email && createdUserId`.
