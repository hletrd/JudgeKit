# Cycle 17 Code Review — Multi-Angle Deep Review

**Date:** 2026-04-19
**Base commit:** 842e1359
**Reviewer:** code-reviewer (multi-angle: quality, security, performance, architecture, correctness, testing)

## F1 — [MEDIUM] `sign-out.ts` `APP_STORAGE_PREFIXES` misses three localStorage key prefixes used by the app

- **File:** `src/lib/auth/sign-out.ts:11-14`
- **Confidence:** HIGH
- **Evidence:** The `APP_STORAGE_PREFIXES` array only includes `"source-draft-"` and `"code-draft-"`, but the application uses at least three additional prefixes:
  1. `"oj:submission-draft"` (from `src/hooks/use-source-draft.ts:5` — `STORAGE_PREFIX = "oj:submission-draft"`)
  2. `"oj:preferred-language"` (from `src/hooks/use-source-draft.ts:6` — `LANGUAGE_PREF_PREFIX = "oj:preferred-language"`)
  3. `"judgekit_anticheat_pending"` (from `src/components/exam/anti-cheat-monitor.tsx:15` — `STORAGE_KEY = "judgekit_anticheat_pending"`)
  4. `"compiler:language"` (from `src/app/(dashboard)/dashboard/compiler/compiler-client.tsx:158`)
- **Failure scenario:** User signs out. Draft source code (`oj:submission-draft:*`) persists in localStorage. Next user on the same browser (shared computer in a lab) sees the previous user's code drafts. Anti-cheat pending events also persist.
- **Suggested fix:** Add `"oj:"`, `"judgekit_anticheat_"`, and `"compiler:"` to `APP_STORAGE_PREFIXES`. Alternatively, unify all app storage keys under a single prefix (e.g., `"jk_"`) and update all callers.

## F2 — [MEDIUM] `redeemRecruitingToken` still uses `new Date()` for expiry differentiation after atomic claim failure

- **File:** `src/lib/assignments/recruiting-invitations.ts:510`
- **Confidence:** HIGH
- **Evidence:** After the atomic SQL claim returns no rows (line 506), the code differentiates the error using `invitation.expiresAt && invitation.expiresAt < new Date()`. This is the same JS-side date comparison that was removed from the pre-check paths in commit b42a7fe4. While the primary deadline enforcement is now SQL-only, this post-failure diagnostic still uses `new Date()`, which can produce a misleading `tokenExpired` error when the real cause was a concurrent claim. The error message affects user experience (shows "expired" vs "already redeemed").
- **Failure scenario:** App server clock is 3 seconds ahead. Two concurrent redeem requests arrive. The first claim succeeds. The second atomic update returns no rows. The `new Date()` check incorrectly says "expired" instead of "alreadyRedeemed" because the app clock thinks it's past expiry. User sees wrong error message.
- **Suggested fix:** When the atomic update returns no rows, return "alreadyRedeemed" as the default error (the invitation was either claimed by another request or expired — but we cannot reliably distinguish without a DB query, and "already redeemed" is the more common case). Remove the `new Date()` differentiation.

## F3 — [MEDIUM] `recruiting/validate` route uses `new Date()` for expiry and deadline checks — same clock skew risk

- **File:** `src/app/api/v1/recruiting/validate/route.ts:39,51`
- **Confidence:** HIGH
- **Evidence:** Both the invitation expiry check (`invitation.expiresAt && invitation.expiresAt < new Date()`) and the assignment deadline check (`assignment.deadline && assignment.deadline < new Date()`) use JS-side date comparison. This is the same anti-pattern that was fixed in `redeemRecruitingToken` (commit b42a7fe4). The validate route is a pre-check endpoint that tells candidates whether their token is still valid. If the app server clock is ahead, candidates near the deadline will be told their token is invalid even though it's still valid in DB time.
- **Failure scenario:** App server clock is 5 seconds ahead of DB. Candidate submits token at exactly the deadline. The validate route returns `{ valid: false }` because `new Date()` is past the deadline, but the token is actually still valid. Candidate gives up instead of redeeming.
- **Suggested fix:** Use SQL `NOW()` for the date comparisons, or accept the minor inconsistency and add a code comment documenting the tradeoff (the validate endpoint is informational only — the authoritative check happens in `redeemRecruitingToken` which already uses SQL).

## F4 — [LOW] `validateShellCommand` regex uses `\bexec\b` but also blocks harmless commands like "executive" — false positive

- **File:** `src/lib/compiler/execute.ts:156`
- **Confidence:** MEDIUM
- **Evidence:** The regex `/\beval\b|\bexec\b|\bsource\b/` will reject any command containing "exec" as a word boundary match, including legitimate commands like `executable-runner`, `exec-compiler`, etc. The comment on line 146-147 acknowledges a similar false-positive for `eval-xxx` with `\beval\b`. The same issue applies to `\bexec\b`.
- **Failure scenario:** Admin configures a compile command starting with "exec" as part of a legitimate tool name. `validateShellCommand` rejects it. Admin must rename the tool.
- **Suggested fix:** Either (a) remove `\bexec\b` from the denylist since commands run in a sandbox anyway, or (b) match more precisely by requiring that "exec" is a standalone token (not part of a longer word), using a split-and-match approach similar to what the Rust side does with `split_whitespace`.

## F5 — [LOW] SSE `onPollResult` re-auth IIFE can silently swallow terminal-state errors

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:375-406`
- **Confidence:** MEDIUM
- **Evidence:** The re-auth IIFE at line 375 calls `await sendTerminalResult()` at line 401. `sendTerminalResult()` has its own try/catch that logs errors and sends an error event. However, the IIFE is invoked with `void (async () => { ... })()` — it's fire-and-forget from the synchronous callback. If the `sendTerminalResult()` call takes long (e.g., slow DB query) and the connection closes in the meantime, the `sendTerminalResult` finally block calls `close()` which is safe. But the real issue is that the IIFE is asynchronous while the fast path (line 417) uses `void sendTerminalResult()` (also fire-and-forget). Both paths are un-awaited, meaning errors in `sendTerminalResult` are only logged, never propagated.
- **Failure scenario:** `sendTerminalResult` throws an unhandled exception (not caught by its own try/catch, e.g., an Out of Memory error in JSON.stringify of a very large submission). The exception becomes an unhandled promise rejection.
- **Suggested fix:** Wrap the IIFE body in a top-level try/catch that logs any unexpected errors, ensuring no unhandled promise rejections.

## F6 — [LOW] `authorizeRecruitingToken` fetches full user row without column restriction

- **File:** `src/lib/auth/recruiting-token.ts:23-26`
- **Confidence:** MEDIUM
- **Evidence:** `db.query.users.findFirst({ where: eq(users.id, result.userId) })` selects all columns from the users table, including `passwordHash`. The result is passed to `createSuccessfulLoginResponse` which calls `mapUserToAuthFields` — this only needs `AUTH_PREFERENCE_FIELDS` and core fields, not `passwordHash`. Compare with `findSessionUser` which uses `authUserSelect` to restrict columns.
- **Failure scenario:** A memory dump or logging accident could expose password hashes that were unnecessarily loaded into memory. No runtime correctness issue, but it's a defense-in-depth gap.
- **Suggested fix:** Use `authUserSelect` from `src/lib/db/selects.ts` as the columns selector, same as `findSessionUser` does.

## F7 — [LOW] `contest-scoring.ts` IOI tie sort only uses `totalScore` — doesn't break ties on penalty or submission count

- **File:** `src/lib/assignments/contest-scoring.ts:356`
- **Confidence:** LOW
- **Evidence:** The IOI sort is `entries.sort((a, b) => b.totalScore - a.totalScore)`. When two entries have the same `totalScore`, their relative order is determined by the JS engine's sort stability (guaranteed stable in ES2019+). The rank assignment uses `isScoreTied` (epsilon comparison). There is no secondary tiebreaker for IOI — tied scores get the same rank, which is standard for IOI scoring. However, the order within tied entries is not deterministic (depends on DB query order).
- **Failure scenario:** Two students with identical total scores appear in different orders on different page loads or between the live ranking and the replay, causing confusion.
- **Suggested fix:** Add a deterministic secondary sort key (e.g., userId) for stable ordering within ties.

## F8 — [LOW] `computeContestRanking` SQL `ROUND(score, 2) = 100` may miss exact-100 scores with floating-point drift

- **File:** `src/lib/assignments/contest-scoring.ts:153,175`
- **Confidence:** LOW
- **Evidence:** The SQL query uses `ROUND(score, 2) = 100` to detect accepted submissions. If a score is `99.995`, `ROUND(99.995, 2)` produces `100.00` in PostgreSQL (rounds half-up). But if a score is `99.994999...` due to floating-point representation, `ROUND` might produce `99.99` instead of `100.00`. The JS-side `isScoreTied` uses epsilon comparison but the SQL side uses exact equality.
- **Failure scenario:** A submission that should be "accepted" (score very close to 100 due to rounding) is not counted as accepted in the SQL query, giving an incorrect leaderboard.
- **Suggested fix:** Use `ROUND(score, 2) >= 99.995` or `score >= 99.99` in the SQL query for the AC detection, matching the epsilon tolerance used on the JS side.

## Test Coverage Gaps

1. No test for `APP_STORAGE_PREFIXES` completeness in `sign-out.ts` (F1)
2. No test for `redeemRecruitingToken` error differentiation after atomic claim failure (F2)
3. No test for `recruiting/validate` route deadline behavior near boundary (F3)
4. No test for `authorizeRecruitingToken` column selection scope (F6)
