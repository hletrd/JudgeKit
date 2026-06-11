# tracer — Cycle 3 (2026-05-29)

Causal tracing of the two suspicious flows; competing hypotheses tested.

## Flow A: "A verification email never arrives and no log explains why"
Hypotheses:
- H1: `sendEmail` failed and is silent. REJECTED — `sendEmail`/`sendEmailVerification`
  log the send-failure branch (`email/index.ts:272-273`).
- H2: `isEmailConfigured()` returned false (no provider). REJECTED for silence —
  `sendEmailVerification` returns `{success:false,"email_not_configured"}`, not a
  throw; but the caller discards the return value, so the operator still sees
  nothing UNLESS they check the return. PARTIALLY SUPPORTED.
- H3 (leading): a throw inside `sendEmailVerification` BEFORE the `sendEmail`
  call — `db.transaction` insert/delete (`:245`), `getDbNowUncached()`,
  `generateSecureToken()`, or `decrypt` inside `isEmailConfigured()`. The promise
  rejects; `public-signup.ts:196` `.catch(() => {})` eats it with zero log.
  SUPPORTED — this is the only path that produces total silence. → DBG-C3-3.
Conclusion: the silent-failure surface is real and root-caused to the empty catch.

## Flow B: "A verification/invitation link points at the wrong domain"
Hypotheses:
- H1 (leading): the link origin comes from the request `Host`, not the configured
  canonical origin. SUPPORTED — `public-signup.ts:193-195` /
  `recruiting-invitations/route.ts:123-125` read `x-forwarded-proto`+`host`;
  `getAuthUrl()` (the canonical origin) is never consulted. A spoofed Host on the
  signup server-action path (not behind `validateTrustedAuthHost`) yields an
  attacker-origin link. → SEC-C3-1 / CR-C3-1 / VER-C3-2.
- H2: the trusted-host middleware already blocks this. REJECTED for the signup
  server action — that guard is wired for auth routes, not the signup action; and
  even where it runs, it validates but does not REWRITE the origin used for links.

## Flow C: "All email silently dies after a key rotation" (cycle-2 concern)
Re-traced. RESOLVED — `providers/index.ts:49-57` now wraps the cached-provider
`isConfigured()` in try/catch (cycle-2 3760e6c7); `detectProvider` was already
guarded (cycle-1). A throwing decrypt now degrades to re-detect / `{success:false}`
rather than escaping. No live silent-death path remains. CLOSED.

## Final sweep
Two live causal chains converge on the same two net-new items the other angles
flag: the empty signup catch (Flow A) and host-derived link origin (Flow B).
Both have precise, low-risk fixes.
