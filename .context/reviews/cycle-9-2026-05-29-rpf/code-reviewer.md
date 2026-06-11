# Code Reviewer — Cycle 9 (RPF)

**Date:** 2026-05-29 · **HEAD:** 24939e42 (main)
**Scope:** Email subsystem (freshest code), leaderboard/override routes, signup.

## Files examined
- `src/lib/email/{index,templates,smtp}.ts`, `src/lib/email/providers/*.ts`
- `src/lib/assignments/{leaderboard,contest-scoring,scoring}.ts`
- `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts`
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts`
- `src/lib/actions/public-signup.ts`

## Quality assessment
- **Email templates**: clean separation of subject/text/html; `escapeHtml` applied
  consistently to every HTML body interpolation. Subject not escaped, but that is
  correct (plaintext, no HTML context) — see security-reviewer for the
  no-injection proof.
- **SMTP provider**: transporter is memoized and rebuilt only on config-hash
  change; retry-once-on-transient with transporter rebuild is reasonable; timeouts
  set (connection/greeting/socket). `for (attempt 1..2)` with a final
  unreachable-but-safe `return "exhausted retries"` guard — defensive, fine.
- **Leaderboard route**: PII hardening (`userId` always cleared for non-instructors;
  current-user identified via `isCurrentUser`/`liveRank`); anonymization gated on
  exam/anonymous + not-recruiting. Clear.
- **Override route**: idempotent delete+insert upsert in a transaction; max-points
  clamp; enrollment check; cache invalidation; audit. Good shape.

## Minor observations (NOT findings)
- `hashConfig` (smtp.ts:11) `JSON.stringify` of a config that includes the
  decrypted password — used only as an in-memory cache key, never logged. Acceptable.
- Three HTTP providers duplicate the `from` fallback chain (`X_FROM || SMTP_FROM ||
  "noreply@judgekit.local"`). Tiny duplication, not worth a shared helper for 3
  call sites. (Matches the repo's existing "don't over-abstract <=3 callers" stance.)

## Verdict
No net-new code-quality finding. Code is consistent with established repo patterns.
