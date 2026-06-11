# Debugger — Cycle 9 (RPF)

**Date:** 2026-05-29 · **HEAD:** 24939e42 (main)

## Failure-mode sweep on the email subsystem
- **send failure does not break signup**: `public-signup.ts:199` fire-and-forget
  `.catch()` — a thrown decrypt/db error in `sendEmailVerification` is logged, not
  propagated. No unhandled rejection. Good.
- **legacy plaintext smtpPass**: `providers/smtp.ts:54` `allowPlaintextFallback`
  prevents `decrypt()` throwing → would otherwise disable ALL email silently.
  Latent failure mode already closed.
- **transient SMTP retry**: rebuilds transporter and retries once on
  ECONNRESET/ETIMEDOUT/ECONNREFUSED/ESOCKET/`421`/`try again`. Non-transient
  failures return immediately. No infinite loop (bounded `attempt <= 2`).
- **verifyEmail double-redemption**: conditional UPDATE + rowCount guard inside the
  transaction prevents a token being consumed twice (TOCTOU). Sound.

## Latent-bug check on the live-rank fix
The old SUM-over-all-rows bug (cycle-8 N8) is fixed. Re-checked the edge where a
user has terminal submissions but `best` is NULL for every problem (all scores
NULL): `COALESCE(best,0)` → total 0, and the `hasSubmissions` flag
(`t.total_score IS NOT NULL`) is true because `target` row exists with
total_score 0 → returns a real rank, not null. Consistent with the full board,
which would also give totalScore 0. No discrepancy.

## Verdict
No latent bug surfaced. No net-new finding.
