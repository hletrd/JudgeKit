# Code-Quality Review — Cycle 4 (2026-05-29)

## Findings

### CR-C4-1 [Low / High] — `findSessionUser` returns `undefined`, sibling returns `null`
`src/lib/auth/find-session-user.ts:33,37` return `(await db.select(...))[0]` with
NO `?? null`, whereas `findSessionUserWithPassword:57,61` DO append `?? null`.
Net effect: the two sibling functions have different "not found" sentinels
(`undefined` vs `null`) for the same logical condition. Callers that do
`const u = await findSessionUser(s); if (u === null) ...` would mis-handle the
not-found case. FIX: append `?? null` on both branches of `findSessionUser` to
match the documented sibling and make the return type honest (`... | null`).
Low because most callers use truthiness checks, but it is an easy correctness
footgun and an inconsistency between two functions that explicitly cross-reference
each other in their doc comments.

### CR-C4-2 [Low / Medium] — duplicated worker lookup in claim route
`src/app/api/v1/judge/claim/route.ts`: `isJudgeAuthorizedForWorker` (line 130)
selects the worker row, then lines 143-150 select it AGAIN for status +
secretTokenHash, and on the not-claimed path lines 298-306 select a THIRD time.
Three round-trips for the same row on the hot claim path. FIX: fold the
auth+status+capacity check into a single SELECT (or pass the already-fetched row
out of the auth helper). Perf-adjacent; tracked here for maintainability.

### CR-C4-3 [Low / Low] — `extractClientIp` non-prod sentinel `"0.0.0.0"` leaks into matcher
`ip.ts:91` returns the string `"0.0.0.0"` outside production. `ip-allowlist.ts:171`
special-cases exactly `"0.0.0.0"` to deny — good — but this coupling is implicit
and undocumented at the `ip.ts` return site. FIX: add a comment at `ip.ts:91`
noting the `0.0.0.0` sentinel is consumed by `isJudgeIpAllowed`, or export a named
constant shared by both.

## Confirmations
- `rate-limit-core.ts` extraction is clean; both consumers share `fetchRateLimitEntry`.
- `verdict.ts` pure functions are well-factored and individually testable.
- `access-view.ts` predicate is correctly derived from the source union type.
