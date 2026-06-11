# Tracer — Causal Flow Analysis — Cycle 1 (2026-05-29)

## Traced flow: "Why might transactional email silently stop in production?"

Competing hypotheses:
- H1: SMTP not configured. Ruled out — `isConfigured()` returns false cleanly, no throw.
- H2: Transient network errors. Ruled out — retry loop handles ECONNRESET/421/etc.
- H3 (LEADING): Legacy plaintext `smtpPass` causes `decrypt()` to throw in production.
  Trace: `sendEmailVerification`/`sendPasswordResetEmail`/recruiting POST
  → `isEmailConfigured()`/`sendEmail()` (providers/index.ts)
  → `smtpProvider.isConfigured()`/`send()` → `getSmtpConfig()` (smtp.ts:41-57)
  → `decrypt(raw.smtpPass)` with no fallback option (smtp.ts:47)
  → in production, non-`enc:` value → THROW (encryption.ts:103).
  `detectProvider` does not catch (index.ts:16-23), so the throw propagates. For the
  signup path the throw is swallowed by the `.catch(() => {})` (public-signup.ts:196)
  — so signup still succeeds but NO verification email is sent and the only signal is a
  log line. For the recruiting route the `await isEmailConfigured()` guard (route.ts:121)
  would throw and 500 the request. This matches the "silent for users, 500 for some
  callers" failure signature. Strongest hypothesis. Maps to SEC-C1-1 / DBG-C1-1 / VER-C1-1.

## Traced flow: "Could an outbound email link point at an attacker host?"
`public-signup.ts:193-195` / recruiting `route.ts:122-124` build baseUrl from
`x-forwarded-proto` + `host` request headers. If a deployment does not have a proxy
that rewrites Host, a forged Host yields a verification/invite link on the attacker's
domain. Mitigated in typical deployments; flagged as CR-C1-2 / ARCH-C1-1.
