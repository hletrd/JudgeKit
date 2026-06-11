# Document-Specialist — Doc/Code Mismatch Review — Cycle 4 (2026-05-29)

## Findings

### DOC-C4-1 [Low / Medium] — `findSessionUser` doc-comment vs behavior
`find-session-user.ts:22-24` says it returns "the session user … (excludes
passwordHash)" but does not state the not-found return value, while the sibling
implicitly returns `null`. After the CR-C4-1 fix, the doc should state it returns
`null` when not found, matching `findSessionUserWithPassword`.

### DOC-C4-2 [Low / Low] — `.env.example` lacks JUDGE_ALLOWED_IPS IPv6 guidance
`scripts/online-judge.nginx.conf` forwards `$remote_addr` which may be an
IPv4-mapped IPv6 on dual-stack listeners; the env docs for `JUDGE_ALLOWED_IPS`
don't warn operators to add the mapped form (or that the app should normalize it).
After SEC-C4-1's fix this becomes moot; until then, a doc note would help. Folds
into the SEC-C4-1 fix.

## Confirmations
- `api-rate-limit.ts` / `rate-limit-core.ts` module headers accurately describe the
  two-limiter architecture and the drift-tracking contract; code matches docs.
- `poll/route.ts` header accurately explains the historical "poll" naming and the
  deployed-binary path constraint.
