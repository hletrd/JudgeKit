# security-reviewer — Cycle 3 (2026-05-29)

Scope: OWASP-style pass over the email/SMTP, public-signup, recruiting, and
system-settings surface plus the secret-handling helpers (encryption, env).

## SEC-C3-1 [Low / Medium] — Verification/invitation email links trust the client `Host` header
`src/lib/actions/public-signup.ts:193-195`,
`recruiting-invitations/route.ts:123-125`. The base URL embedded in the
verification link and the recruiting access link is built from
`x-forwarded-proto` + `host`. The signup server action path is NOT behind the
`validateTrustedAuthHost` middleware guard (that guard is wired for auth routes),
so an attacker who controls the `Host`/`X-Forwarded-Host` header on a signup
request can have the system mint a verification email pointing at
`https://attacker.example/verify-email?token=...`. If the victim clicks, the
token is delivered to the attacker (token exfiltration / phishing pivot).
- Exploit scenario: attacker triggers signup for a victim's email via a proxied
  request setting `Host: evil.tld`; victim receives a "verify your email" mail
  whose link host is `evil.tld`; the verification token is leaked on click.
- Severity Low (requires the victim to act on a mismatched-domain link and the
  signup flow to be reachable), but it is a real CWE-601 / host-header-injection
  class issue. NOT a data-loss issue.
- Fix (DEFENSE-IN-DEPTH, fold the carried-over F4-cycle1): prefer the configured
  canonical origin (`getAuthUrl()`) for outbound links; only fall back to the
  request host when no canonical URL is configured. Centralize in
  `getPublicBaseUrl()`.

## SEC-C3-2 [Low / High-confidence-non-exploitable] — Decrypted SMTP password lingers in `lastConfigHash`
`smtp.ts:11-13, 120, 157`. The cleartext SMTP password is serialized into the
module-scope `lastConfigHash`. Not logged, not persisted, not sent anywhere, so
not remotely exploitable — but it widens the in-memory secret footprint
(heap/core dump exposure). Fix: hash before caching. Carried-over CR-C2-1, OPEN.

## Confirmed-good / closed
- `smtpPass` ciphertext is no longer written to the audit log
  (`system-settings.ts:229-235`, shared `SECRET_SETTING_KEYS`). Cycle-2 fix
  verified present. The earlier SEC-C2-1 (highest-signal cycle-2 finding) is
  CLOSED.
- `SMTP_SKIP_TLS_VERIFY` is now `=== "true"` (no truthiness footgun) and is
  documented in `.env.example:34`. Cycle-2 SEC-C2-3 CLOSED.
- Encryption uses AES-256-GCM with a 96-bit IV + 128-bit tag; key is validated
  to 32 bytes; `decrypt` defaults `allowPlaintextFallback=false` in production.
  The plaintext fallback on the SMTP/hcaptcha read paths is an EXPLICIT,
  documented migration allowance (`encryption.ts` header, C7-AGG-7 deferred) and
  emits a production warn-log audit trail. No new exposure.
- Recruiting tokens: only `tokenHash` is persisted; plaintext token is returned
  in-memory only and never logged (verified `recruiting-invitations.ts`).
- Subjects interpolate unescaped values (`templates.ts:59,75`) — subjects are not
  HTML; residual CR/LF header-injection risk is mitigated by nodemailer
  sanitization + validated source values. Defense-in-depth only (cycle-1 F8,
  already deferred). No change.

## Final sweep
No new High/Critical. No secrets-to-logs regressions. The one actionable net-new
angle (SEC-C3-1) overlaps the carried-over base-URL-trust item and should be
fixed via the centralized helper.
