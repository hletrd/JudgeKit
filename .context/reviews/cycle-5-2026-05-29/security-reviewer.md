# Security Reviewer — Cycle 5 (2026-05-29)

Angle: OWASP, secrets, auth/authz, unsafe patterns. Scope: judge worker
lifecycle, rate limiter, contest scoring.

## Auth/authz of judge routes — verified sound
- All five judge routes gate on `isJudgeIpAllowed` first, then per-worker auth
  (`isJudgeAuthorizedForWorker`) or shared-token (`isJudgeAuthorized`).
- `isJudgeAuthorizedForWorker` (auth.ts:52-97) correctly: rejects unknown
  workerIds (no shared-token fallback for registered-worker ids — closes the prior
  leaked-shared-token-forges-any-worker hole), hashes the bearer and compares with
  `safeTokenCompare`, rejects legacy no-hash rows. Good.
- `claim` adds defense-in-depth body-secret check vs `secretTokenHash`
  (route.ts:159-166). `heartbeat`/`deregister` both re-verify the hashed secret.
- register mints a 32-byte random secret, persists only the hash, returns plaintext
  once (register/route.ts:47,62,73). Correct secret-at-rest handling.

No net-new SEC finding in the auth layer this cycle.

### SEC-C5-1 (= N1, availability) — crashed-worker capacity leak keeps health degraded
Not an integrity/confidentiality issue. Availability: `admin-health.ts:89` reports
`degraded` while any worker is `stale`, and there is no reaper, so a single crashed
worker holds the system in degraded health indefinitely with a stale non-zero
`active_tasks`. Fix is the reaper / sweep-zero (see debugger N1). Low severity
(self-healing on admin force-remove; no exploit, no data exposure).

### F3 (carried) — worker result trust
Re-confirmed: `score = passed/results.length` and unscoped `testCaseId` are gated
by per-worker secret + claimToken ownership + IP allowlist. Under the documented
trusted-worker model these are NOT exploitable by an external party. Validating
them server-side defends only against a compromised/buggy trusted worker — the
exact threat the cycle-4 ledger deferred with exit criterion "untrusted/third-party
workers become possible." No change to the trust model this cycle → stays deferred,
severity preserved (LOW/MEDIUM).

## Secrets / injection
- Raw SQL in claim/contest-scoring uses named `@param` binding via
  `rawQueryOne/rawQueryAll` — no string interpolation of user input. The
  `TERMINAL_SUBMISSION_STATUSES_SQL_LIST` and `buildIoiLatePenaltyCaseExpr` are
  code-constant SQL fragments, not user data. No injection vector.
- No plaintext secrets logged in the reviewed paths.

No High/Critical. No remote-exploit. Net-new: SEC-C5-1 (= N1) only.
