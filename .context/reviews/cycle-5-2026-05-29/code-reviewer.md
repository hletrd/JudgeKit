# Code Reviewer — Cycle 5 (2026-05-29)

Angle: code quality, logic, SOLID, maintainability.

## CR-C5-1 (= N1) — staleness sweep leaves `active_tasks` inconsistent
`heartbeat/route.ts:82-89` only sets `status: "stale"`. The invariant the rest of
the code relies on ("active_tasks counts in-flight work") is broken for a crashed
worker because its tasks get reclaimed elsewhere but its counter is never zeroed.
The graceful paths (deregister, admin DELETE) DO zero it — so the invariant is
maintained on every path EXCEPT the crash path the sweep handles. Inconsistent
handling of the same invariant across sibling paths. Fix: zero `active_tasks` in
the sweep once a row is stale past the stale-claim timeout (or add a reaper). Low.

## CR-C5-2 (= N2) — misleading parameter use
`claim/route.ts:121` passes an IP/auth/worker scope as the `userId` argument of
`consumeUserApiRateLimit`, yielding keys like `api:judge:claim:user:ip:1.2.3.4`.
Works, but the `user:` infix is wrong for non-user identities. Rename the param to
`scope`/`identity` (it is already used generically) or document the overload. Low,
maintainability only.

## Positives
- `coerceNullableNumber` (claim/route.ts:28-35) rigorously rejects NaN/Infinity
  from raw-query string coercion. Good defensive parsing.
- The claim-failure rollback (claim/route.ts:360-384) re-checks the claim token in
  a transaction before resetting — correctly guards the look-up race. Good.
- `verdict.ts` is small, pure, and well-tested (verdict.test.ts covers score
  rounding edge cases incl. 33.33/66.67/0.01). No quality finding.

No SOLID violations introduced. Net-new: CR-C5-1 (= N1), CR-C5-2 (= N2).
