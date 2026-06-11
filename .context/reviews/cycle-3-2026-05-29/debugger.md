# debugger — Cycle 3 (2026-05-29)

Scope: latent failure modes and regressions in the email send pipeline,
recruiting routes, and settings save.

## DBG-C3-1 [Low / Medium] — Transporter cache key drops on a transient-retry rebuild but is never invalidated on config change between sends
`smtp.ts:111-121` builds the transporter when `lastConfigHash !== cfgHash`. On a
transient failure (`:148-157`) it rebuilds and re-sets `lastConfigHash = cfgHash`
(same value) — fine. The cache invalidation is correct because `cfgHash` includes
all config fields. No bug here; the earlier concern (stale transporter after an
admin changes SMTP settings) is actually handled because `getSmtpConfig()` is
re-read each send and the hash changes. CONFIRMED-GOOD on closer trace.

## DBG-C3-2 [Low / Medium] — `send()` retry loop can fall through to a misleading terminal error
`smtp.ts:126-167`: the `for (attempt=1; attempt<=2)` loop returns on success or
on a non-retryable / final-attempt failure. The trailing
`return { success:false, error:"SMTP send exhausted retries" }` (line 166) is
only reachable if the loop body neither returns nor continues — which cannot
happen given the branch structure (every path in the catch either `continue`s or
`return`s). It is dead-but-defensive. Not a bug; flagging only so a future
refactor doesn't "simplify" the loop and lose the second attempt. CONFIRMED-GOOD.

## DBG-C3-3 [Low / Medium] — Fire-and-forget email rejection in recruiting is now logged, but the public-signup sibling still swallows silently
`public-signup.ts:196-198`: `sendEmailVerification(...).catch(() => {})` with a
comment "logged inside sendEmailVerification". This relies on
`sendEmailVerification` catching ALL throws internally. If that function itself
throws synchronously before returning the promise (e.g. a bad arg) or rejects
with something it does not log (e.g. a render error outside `sendEmail`), the
rejection vanishes with no trace — asymmetric with the recruiting route, which
cycle-2 (9cd4b16e) gave an explicit `logger.warn`.
- Failure scenario: `NODE_ENCRYPTION_KEY` unset at send time → `decrypt` throws
  inside config resolution → if the throw escapes `sendEmail`'s guard path, the
  signup catch eats it silently and the operator has zero signal that
  verification mail is dead.
- Fix: replace `() => {}` with a `logger.warn` mirroring the recruiting route, so
  both fire-and-forget sites have symmetric observability. Low (the inner
  function does log its own send failures today), but the asymmetry is a latent
  blind spot.

## DBG-C3-4 [Low / Low] — `getActiveProviderName()` staleness after reconfigure
`providers/index.ts:70-72`. Observability-only; same as ARCH/CR note. OPEN.

## Confirmed-good
- `sendEmail` cached-provider re-check is now wrapped in try/catch
  (`providers/index.ts:49-57`, cycle-2 3760e6c7). A throwing cached provider now
  degrades to re-detect instead of escaping. The cycle-2 DBG-C2-1 is CLOSED.
- Recruiting expiry guards (NaN date, in-past, too-far) are present in BOTH
  single and bulk routes. Good.

## Final sweep
One net-new latent item worth a tiny fix: DBG-C3-3 (symmetric logging on the
public-signup fire-and-forget catch). The rest are carried-over OPEN or
confirmed-good on re-trace.
