# verifier — Cycle 3 (2026-05-29)

Evidence-based correctness check against stated behavior. Baseline verified:
lint exit 0, tsc exit 0, build exit 0, `vitest run` 319 files / 2438 tests passed,
`lint:bash` exit 0.

## VER-C3-1 [Low / High] — Confirmed: public-signup fire-and-forget swallows non-`sendEmail` throws
Claim under test: the comment at `public-signup.ts:197` ("logged inside
sendEmailVerification") guarantees every failure of the verification dispatch is
logged.
Evidence: `src/lib/email/index.ts:215-278`. `sendEmailVerification` logs ONLY the
`sendEmail` failure branch (`:272-273`). It can THROW (not return) from:
`db.transaction(...)` (`:245`), `getDbNowUncached()` (`:241`),
`generateSecureToken()` (`:240`), or `isEmailConfigured()` (`:219`, which decrypts
the SMTP secret). Any such throw rejects the promise; `public-signup.ts:196-198`
catches it with `() => {}` and emits NOTHING. The comment's guarantee is FALSE
for those paths.
Verdict: the stated invariant ("all failures logged") does not hold. Low severity
(controlled-failure paths still return cleanly; only infra throws are silent), but
the asymmetry with the recruiting sibling (which logs its catch, 9cd4b16e) is
real. Recommend a `logger.warn` in the signup catch.

## VER-C3-2 [Low / High] — Confirmed: outbound base URL derived from request `Host`, not the canonical configured origin
Claim: invitation/verification links point at the deployment's canonical origin.
Evidence: `public-signup.ts:193-195` and `recruiting-invitations/route.ts:123-125`
both compute the origin from `x-forwarded-proto` + `host` request headers, while
`getAuthUrl()` (`env.ts:62`) holds the configured canonical origin and is NOT
consulted. Verdict: the link origin is request-controlled on these paths, not
canonical. Matches carried-over F4-cycle1; still OPEN.

## VER-C3-3 [confirmed-good] — cycle-2 fixes verified present in code
- `system-settings.ts:56` `SECRET_SETTING_KEYS = new Set(["hcaptchaSecret","smtpPass"])`;
  `:233` redacts any key in it. smtpPass NO LONGER reaches the audit log. CLOSED.
- `smtp.ts:92` `rejectUnauthorized: process.env.SMTP_SKIP_TLS_VERIFY !== "true"`.
  CLOSED. Documented `.env.example:34`.
- `providers/index.ts:49-57` cached-provider `isConfigured()` re-check wrapped in
  try/catch. CLOSED.
- `recruiting-invitations/route.ts:140-147` `.catch` logs `logger.warn`. CLOSED.

## VER-C3-4 [confirmed-good] — bulk token re-attach is correct
`recruiting-invitations.ts:223-227` maps returned rows back to plaintext tokens by
`tokenHash`. Verified the Map is keyed on the same `tokenHash` that is inserted;
collision impossible (hash is unique per token). Tokens are available in-memory,
so a future bulk-email feature is feasible. (See F2 cross-cutting.)

## Final sweep
Two confirmed net-new/carried correctness-adjacent items (VER-C3-1 silent-catch,
VER-C3-2 host-trust). No invariant violations that cause data loss. No
test/comment was trusted without code-level verification.
