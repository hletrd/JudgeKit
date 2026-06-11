# Document Specialist — Cycle 9 (RPF)

**Date:** 2026-05-29 · **HEAD:** 24939e42 (main)

## Doc/code consistency checks
- **leaderboard.ts:196-215 docstring**: now accurately describes the
  per-problem-best CTE shape and the deferred N7-C7 override-overlay note. Matches
  the implemented query (verifier confirmed). No drift.
- **scoring.ts:114-137 docstring** for `buildIoiLatePenaltyCaseExpr`: accurately
  states the single-source-of-truth contract and the caller obligations
  (`@deadline/@latePenalty/@examMode` bound, `personal_deadline` available). Both
  callers comply. No drift.
- **providers/smtp.ts:73-93 comments** on `secure`/STARTTLS and
  `SMTP_SKIP_TLS_VERIFY` match nodemailer 7.x behavior (verified against the
  library). Accurate.
- **public-signup.ts:189-208 comment**: accurately describes fire-and-forget +
  canonical-first base URL. Accurate.

## Carried deferred doc items (re-defer)
- C7-DS-1 (README /api/v1/time doc) — LOW, exit = README rewrite cycle.
- DOC-C5-2 (register staleClaimTimeoutMs dead field) — LOW, Rust worker only
  deserializes, never consumes; exit = field is consumed or removed.

## Verdict
No net-new doc/code mismatch. Recent docstrings are accurate.
