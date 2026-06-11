# document-specialist — Cycle 3 (2026-05-29)

Doc/code consistency pass over the changed surface and its env documentation.

## DOC-C3-1 [Low / High] — `public-signup.ts:197` comment is inaccurate ("logged inside sendEmailVerification")
The inline comment asserts every failure is logged inside the callee. Code
(`email/index.ts:215-278`) only logs the `sendEmail`-failure branch; DB/token/
config throws are NOT logged and the empty `.catch(() => {})` discards them.
The comment overstates the guarantee. FIX (paired with DBG-C3-3): when the catch
gains a `logger.warn`, update the comment to describe the actual behavior
("send failures are logged inside sendEmailVerification; this guard logs any
other rejection (DB/config) so it isn't silently swallowed").

## DOC-C3-2 [confirmed-good] — `.env.example` SMTP block is now accurate
`.env.example:22-34` documents the SMTP env override precedence (env wins when
HOST/PORT/USER/PASS all set) and now includes `SMTP_SKIP_TLS_VERIFY` (cycle-2 fix).
Matches `smtp.ts:23-39, 92` behavior. No mismatch.

## DOC-C3-3 [Low / Medium] — `getPublicBaseUrl` is undocumented because it does not yet exist
If CR-C3-1/ARCH-C3-1 lands, document the canonical-origin-first behavior next to
`getAuthUrl()` in `env.ts` and note in `.env.example` that `AUTH_URL`/`NEXTAUTH_URL`
also governs the origin used in outbound email links (currently `.env` docs tie
those vars only to auth). Prevents operators from being surprised that email link
domains follow the auth URL.

## Confirmed-good
- `encryption.ts` header docstring accurately describes the plaintext-fallback
  risk profile and the deferral (C7-AGG-7). Matches code defaults
  (`allowPlaintextFallback` false in prod). No drift.
- AGENTS.md PostgreSQL version / image-count claims were corrected in a prior
  cycle (DOC-1/DOC-2, cycle-1 plan). Not re-checked in depth; out of this cycle's
  changed surface.

## Final sweep
One net-new doc/code mismatch (DOC-C3-1, the inaccurate signup comment), which is
fixed as a byproduct of the DBG-C3-3 code change. No authoritative-source
contradictions found in the email/SMTP env documentation.
