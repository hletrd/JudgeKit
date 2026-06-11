# Cycle 17 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from: `cycle-17-code-reviewer.md` (multi-angle review covering code quality, security, performance, architecture, correctness, testing)
- Base commit: 842e1359

## Deduped findings

### AGG-1 — [MEDIUM] `sign-out.ts` `APP_STORAGE_PREFIXES` misses four localStorage key prefixes used by the app

- **Severity:** MEDIUM (security — data leakage between users on shared computers)
- **Confidence:** HIGH
- **Cross-agent agreement:** F1
- **Files:** `src/lib/auth/sign-out.ts:11-14`
- **Evidence:** The `APP_STORAGE_PREFIXES` array only includes `"source-draft-"` and `"code-draft-"`, but the application uses at least four additional prefixes:
  1. `"oj:submission-draft"` (from `src/hooks/use-source-draft.ts:5`)
  2. `"oj:preferred-language"` (from `src/hooks/use-source-draft.ts:6`)
  3. `"judgekit_anticheat_pending"` (from `src/components/exam/anti-cheat-monitor.tsx:15`)
  4. `"compiler:language"` (from `src/app/(dashboard)/dashboard/compiler/compiler-client.tsx:158`)
  This was a follow-up fix from cycle 16 L7 which replaced `localStorage.clear()` with targeted key removal, but the prefix list was incomplete. The old `localStorage.clear()` did remove these keys; the new targeted approach leaves them behind, making the sign-out behavior *worse* than before for these specific keys.
- **Failure scenario:** User signs out on a shared computer in a school lab. Source code drafts (`oj:submission-draft:*`) persist in localStorage. Next student sees the previous student's code. Anti-cheat pending events also persist, potentially sending stale events for a different user.
- **Suggested fix:** Add `"oj:"`, `"judgekit_anticheat_"`, and `"compiler:"` to `APP_STORAGE_PREFIXES`.

### AGG-2 — [MEDIUM] `redeemRecruitingToken` still uses `new Date()` for expiry differentiation after atomic claim failure

- **Severity:** MEDIUM (correctness — misleading error message)
- **Confidence:** HIGH
- **Cross-agent agreement:** F2
- **Files:** `src/lib/assignments/recruiting-invitations.ts:510`
- **Evidence:** After the atomic SQL claim returns no rows (line 506), the code differentiates the error using `invitation.expiresAt && invitation.expiresAt < new Date()`. This is the same JS-side date comparison that was removed from the pre-check paths in commit b42a7fe4 (cycle 16 L8). While the primary deadline enforcement is now SQL-only, this post-failure diagnostic still uses `new Date()`, which can produce a misleading `tokenExpired` error when the real cause was a concurrent claim.
- **Failure scenario:** App server clock is 3 seconds ahead. Two concurrent redeem requests arrive. The first claim succeeds. The second atomic update returns no rows. The `new Date()` check incorrectly says "expired" instead of "alreadyRedeemed" because the app clock thinks it's past expiry. User sees wrong error message.
- **Suggested fix:** When the atomic update returns no rows, default to "alreadyRedeemed" (the more common case for concurrent requests). Remove the `new Date()` differentiation, or query the DB for the current invitation status to disambiguate.

### AGG-3 — [MEDIUM] `recruiting/validate` route uses `new Date()` for expiry and deadline checks — same clock skew risk as fixed in cycle 16

- **Severity:** MEDIUM (correctness — pre-check endpoint gives wrong answer near deadline)
- **Confidence:** HIGH
- **Cross-agent agreement:** F3
- **Files:** `src/app/api/v1/recruiting/validate/route.ts:39,51`
- **Evidence:** Both the invitation expiry check (`invitation.expiresAt && invitation.expiresAt < new Date()`) and the assignment deadline check (`assignment.deadline && assignment.deadline < new Date()`) use JS-side date comparison. This is the same anti-pattern that was fixed in `redeemRecruitingToken` (commit b42a7fe4). The validate route is a pre-check endpoint that tells candidates whether their token is still valid. If the app server clock is ahead, candidates near the deadline will be told their token is invalid even though it's still valid in DB time.
- **Failure scenario:** App server clock is 5 seconds ahead of DB. Candidate submits token at exactly the deadline. The validate route returns `{ valid: false }` because `new Date()` is past the deadline, but the token is actually still valid. Candidate gives up instead of redeeming.
- **Suggested fix:** Use SQL `NOW()` for the date comparisons by re-querying with a SQL condition, or add a safety margin (e.g., check `expiresAt < new Date(Date.now() - 5000)` to account for clock skew). Document the tradeoff in a code comment.

### AGG-4 — [LOW] `authorizeRecruitingToken` fetches full user row including `passwordHash` without column restriction

- **Severity:** LOW (defense-in-depth — unnecessary data in memory)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** F6
- **Files:** `src/lib/auth/recruiting-token.ts:23-26`
- **Evidence:** `db.query.users.findFirst({ where: eq(users.id, result.userId) })` selects all columns from the users table, including `passwordHash`. The result is passed to `createSuccessfulLoginResponse` which calls `mapUserToAuthFields` — this only needs `AUTH_PREFERENCE_FIELDS` and core fields, not `passwordHash`. Compare with `findSessionUser` which uses `authUserSelect` to restrict columns.
- **Failure scenario:** A memory dump or logging accident could expose password hashes that were unnecessarily loaded into memory.
- **Suggested fix:** Use `authUserSelect` from `src/lib/db/selects.ts` as the columns selector, same as `findSessionUser` does.

### AGG-5 — [LOW] `validateShellCommand` regex `\bexec\b` blocks harmless commands starting with "exec" — false positive

- **Severity:** LOW (usability — false rejection of legitimate commands)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** F4
- **Files:** `src/lib/compiler/execute.ts:156`
- **Evidence:** The regex `/\beval\b|\bexec\b|\bsource\b/` will reject any command containing "exec" as a word boundary match, including legitimate commands like "executable-runner", "exec-compiler", etc. The comment on line 146-147 acknowledges a similar false-positive for `eval-xxx` with `\beval\b`.
- **Failure scenario:** Admin configures a compile command starting with "exec" as part of a legitimate tool name. `validateShellCommand` rejects it. Admin must rename the tool.
- **Suggested fix:** Either (a) remove `\bexec\b` from the denylist since commands run in a sandbox anyway, or (b) use the same `split_whitespace` approach that the Rust runner uses.

### AGG-6 — [LOW] SSE `onPollResult` re-auth IIFE is fire-and-forget — unhandled promise rejections possible

- **Severity:** LOW (reliability — potential unhandled rejection)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** F5
- **Files:** `src/app/api/v1/submissions/[id]/events/route.ts:375`
- **Evidence:** The IIFE at line 375 is invoked with `void (async () => { ... })()`. If the async body throws beyond what `sendTerminalResult` catches (e.g., Out of Memory in JSON.stringify of a very large submission), the exception becomes an unhandled promise rejection.
- **Failure scenario:** A very large submission result causes an OOM during JSON.stringify inside the IIFE. The error propagates as an unhandled promise rejection, potentially crashing the process if `--unhandled-rejections=throw` is set.
- **Suggested fix:** Wrap the IIFE body in a top-level try/catch that logs any unexpected errors.

## Previously Deferred Items (Carried Forward)

- D1: JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2: JWT callback DB query on every request — add TTL cache (MEDIUM)
- D3: SSE route refactoring — extract connection tracking and polling (MEDIUM)
- D4: SSE submission events route capability check incomplete (MEDIUM)
- D5: Test coverage gaps for workspace-to-public migration (MEDIUM)
- D6: Metrics endpoint dual auth paths without rate limiting (MEDIUM)
- D7: Internal cleanup endpoint has no rate limiting (LOW)
- D8: `localStorage.clear()` clears all storage for origin (LOW) — now partially addressed by sign-out.ts targeted removal, but AGG-1 shows the prefix list is incomplete
- D9: `rateLimits` table used for SSE connections and heartbeats (LOW)
- D10: Backup/restore/migrate routes use manual auth pattern (LOW)
- D11: Files/[id] DELETE/PATCH manual auth (LOW)
- D12: SSE re-auth rate limiting (LOW)
- D13: PublicHeader click-outside-to-close (LOW)
- D14: `namedToPositional` regex alignment (LOW)
- D15: `tracking-wide`/`tracking-wider` Korean text risk (LOW) — partially addressed, still open for remaining labels
- D16: SSE shared poll timer interval not adjustable at runtime (LOW)
- D17: Export abort does not cancel in-flight DB queries (LOW)
- D18: Deprecated `recruitingInvitations.token` column still has unique index (LOW)
- D19: `validateExport` missing duplicate table name check (LOW)
- AGG-5(c16): `ri_token_idx` unique index on deprecated token column (LOW) — same as D18
- AGG-4(c15): No test coverage for API rate-limiting functions (MEDIUM)

## Agent Failures

None — single-agent multi-angle review completed successfully.
