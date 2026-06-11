# code-reviewer — Cycle 3 (2026-05-29)

Scope: email/SMTP subsystem, public signup auto-verify, recruiting invitations
(single + bulk), system-settings secrets, and the cross-file URL/secret helpers.
Baseline gates all green (lint 0/0, tsc 0, 2438 unit tests, lint:bash 0).

## CR-C3-1 [Low / High] — Outbound email base URL is built from raw `Host` header in two duplicated sites
`src/lib/actions/public-signup.ts:193-195` and
`src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:123-125`
both build `baseUrl = \`${proto}://${host}\`` from `x-forwarded-proto` / `host`
request headers. The repo already has a canonical, trusted source of truth —
`getAuthUrl()` (`src/lib/security/env.ts:62`) returning `AUTH_URL ?? NEXTAUTH_URL`,
and `getTrustedAuthHosts()` / `validateTrustedAuthHost` for host validation.
Building the verification/invitation link from the client-influenced `Host`
header means a spoofed `Host` (where the trusted-host middleware does not apply,
e.g. the server action path) can place an attacker-controlled origin inside an
email link that a victim is likely to trust.
- Why it matters: link-poisoning / token-forwarding to an attacker host; also
  pure duplication (same 3 lines copy-pasted) that already drifted once
  (signup uses `headers()`, recruiting uses `req.headers`).
- Fix: add `getPublicBaseUrl(headerHost?: string): string` in
  `src/lib/security/env.ts` that prefers `getAuthUrl()` (canonical, configured)
  and only falls back to the request host when unset; use it in both sites.
- This is the carried-over F4-cycle1 / SEC-C2-2 item, still OPEN. Re-flagged with
  the concrete helper anchor now identified.

## CR-C3-2 [Low / High] — `hashConfig` is a misnomer and retains the cleartext SMTP password for the process lifetime
`src/lib/email/providers/smtp.ts:11-13` `hashConfig` is `JSON.stringify(config)`,
not a hash, and `config.pass` is the decrypted plaintext SMTP password. The
result is stored in module-scope `lastConfigHash` (line 9, 120, 157) for the life
of the process. It is never logged, so exposure is low, but a heap dump / core
dump would leak the SMTP credential in cleartext and the name actively misleads.
- Fix: key the transporter cache on a sha256 of the serialized config (or on the
  non-secret fields + a hash of the pass). Rename to `configFingerprint`.
- Carried-over F7-cycle1 / CR-C2-1, still OPEN.

## CR-C3-3 [Low / Medium] — `getSmtpConfig()` is fully re-run (settings read + decrypt) on every `isConfigured()` and every `send()`
`smtp.ts:99-101` and `:104-105` both call `await getSmtpConfig()`, which reads
`getSystemSettings()` and `decrypt()`s the password. `sendEmail` (providers/index)
calls `isConfigured()` then `send()` → two full config resolutions per email, plus
the route-level `isEmailConfigured()` guard adds a third. `getSystemSettings()` is
cached, but the decrypt runs each time.
- Fix: resolve config once per `sendEmail` call, or memoize on the settings-cache
  version. Carried-over PERF-C1-1 / F9, still OPEN. Low because admin-rare cadence.

## CR-C3-4 [Low / Medium] — `getActiveProviderName()` can report a stale provider name
`providers/index.ts:70-72` returns `activeProvider?.name`. After a config change
that makes the cached provider no longer configured, the next `sendEmail` re-detects
(good), but any caller of `getActiveProviderName()` before that next send sees the
stale name. Observability-only. Carried-over F12-cycle1 / ARCH-C2-3, still OPEN.

## Confirmed-good (no action)
- `templates.ts` HTML escaping is correct and tested (cycle-1 5ef18a36).
- `system-settings.ts:229-235` now redacts both `hcaptchaSecret` and `smtpPass`
  via the shared `SECRET_SETTING_KEYS` set (cycle-2 e6265884). Good.
- `smtp.ts:92` TLS verify is now `=== "true"` (cycle-2 d99a21a7). Good.
- Recruiting `.catch` now logs (cycle-2 9cd4b16e). Good.

## Final sweep
No net-new logic bugs found in the changed surface. All actionable items are
carried-over OPEN deferrals with now-sharper fix anchors; the highest-value one
is CR-C3-1 (centralized trusted base URL), which is both a duplication cleanup
and a defense-in-depth security improvement.
