# Cycle 17 Review Remediation Plan

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-17-code-reviewer.md` and `.context/reviews/cycle-17-aggregate.md`
**Status:** In Progress

---

## MEDIUM Priority

### M1: Fix `sign-out.ts` `APP_STORAGE_PREFIXES` — add missing localStorage key prefixes

- **File**: `src/lib/auth/sign-out.ts:11-14`
- **Status**: Pending
- **Source**: AGG-1 (cycle 17 aggregate)
- **Plan**:
  1. Add `"oj:"` prefix to `APP_STORAGE_PREFIXES` — covers both `"oj:submission-draft"` and `"oj:preferred-language"`
  2. Add `"judgekit_anticheat_"` prefix — covers `"judgekit_anticheat_pending"`
  3. Add `"compiler:"` prefix — covers `"compiler:language"`
  4. The original `"source-draft-"` and `"code-draft-"` prefixes can be removed if they are superseded by `"oj:"`, or kept for backward compatibility with any remaining keys using the old prefix
  5. Add a code comment referencing the source files that define each prefix so future changes can update this list
  6. Verify that sign-out clears drafts by testing in the browser or adding a unit test
- **Exit criterion**: All app-owned localStorage/sessionStorage keys are cleared on sign-out. No stale user data remains after sign-out.

### M2: Fix `redeemRecruitingToken` post-atomic-claim error differentiation — remove `new Date()` check

- **File**: `src/lib/assignments/recruiting-invitations.ts:510`
- **Status**: Pending
- **Source**: AGG-2 (cycle 17 aggregate), same anti-pattern as cycle 16 L8
- **Plan**:
  1. When the atomic update returns no rows (line 506-514), default to "alreadyRedeemed" error instead of using `new Date()` to differentiate
  2. Remove the `if (invitation.expiresAt && invitation.expiresAt < new Date())` check
  3. Add a code comment explaining why "alreadyRedeemed" is the default: the atomic SQL check is authoritative, and we cannot reliably distinguish concurrent claim from expiry using JS-side clock
  4. Verify the recruiting invitation tests still pass
- **Exit criterion**: No `new Date()` comparisons in the post-atomic-claim error path of `redeemRecruitingToken`. Default error is "alreadyRedeemed".

### M3: Fix `recruiting/validate` route — replace `new Date()` deadline/expiry checks with SQL NOW()

- **File**: `src/app/api/v1/recruiting/validate/route.ts:39,51`
- **Status**: Pending
- **Source**: AGG-3 (cycle 17 aggregate)
- **Plan**:
  1. Replace the JS-side `invitation.expiresAt && invitation.expiresAt < new Date()` check with a SQL-level condition using `NOW()`
  2. Replace the JS-side `assignment.deadline && assignment.deadline < new Date()` check with a SQL-level condition using `NOW()`
  3. This can be done by adding `expires_at > NOW()` to the WHERE clause of the invitation query, and `deadline > NOW()` to the WHERE clause of the assignment query
  4. If the query returns no rows, return `{ valid: false }` — no need to differentiate the reason
  5. Add a code comment explaining the SQL-level enforcement
- **Exit criterion**: No `new Date()` comparisons in the recruiting validate route. Expiry and deadline enforcement uses SQL `NOW()`.

---

## LOW Priority

### L1: Fix `authorizeRecruitingToken` to use `authUserSelect` column restriction instead of fetching all columns

- **File**: `src/lib/auth/recruiting-token.ts:23-26`
- **Status**: Pending
- **Source**: AGG-4 (cycle 17 aggregate)
- **Plan**:
  1. Import `authUserSelect` from `@/lib/db/selects`
  2. Change `db.query.users.findFirst({ where: eq(users.id, result.userId) })` to `db.select(authUserSelect).from(users).where(eq(users.id, result.userId)).limit(1).then(rows => rows[0] ?? null)`
  3. Verify the recruiting token auth flow still works (the fields used by `createSuccessfulLoginResponse` / `mapUserToAuthFields` are all in `authUserSelect`)
  4. Run the recruiting token tests
- **Exit criterion**: `authorizeRecruitingToken` no longer fetches `passwordHash` from the database. Column selection matches `findSessionUser`.

### L2: Remove `\bexec\b` from `validateShellCommand` denylist — false positive with minimal security value

- **File**: `src/lib/compiler/execute.ts:156`
- **Status**: Pending
- **Source**: AGG-5 (cycle 17 aggregate)
- **Plan**:
  1. Remove `\bexec\b` from the regex pattern at line 156
  2. Keep `\beval\b` and `\bsource\b` as they are more commonly used for code injection
  3. Update the comment block above the function to note that `exec` was removed because (a) the sandbox is the primary security boundary, and (b) `exec` is a common prefix for legitimate tool names
  4. Also update the Rust-side validator (`judge-worker-rs/src/runner.rs`) to match, keeping both denylists in lock-step per the existing comment
- **Exit criterion**: `\bexec\b` removed from both Node.js and Rust command validators. `validateShellCommand` no longer rejects commands containing "exec" as a word boundary.

### L3: Add top-level try/catch to SSE re-auth IIFE for unhandled promise rejection safety

- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:375`
- **Status**: Pending
- **Source**: AGG-6 (cycle 17 aggregate)
- **Plan**:
  1. Wrap the async IIFE body (lines 375-406) in a try/catch that logs any unexpected errors
  2. The catch should call `close()` if not already closed, and log the error
  3. Ensure the fast-path `void sendTerminalResult()` at line 417 is also wrapped (it's already in a try/catch inside `sendTerminalResult`, but the void discard means any error outside that try/catch is lost)
- **Exit criterion**: No unhandled promise rejections possible from the SSE polling callback paths.

---

## Deferred Items

| Finding | Severity | Reason | Exit Criterion |
|---------|----------|--------|----------------|
| AGG-7 (IOI tie sort non-deterministic within tied entries) | LOW | Tied entries get the same rank per IOI convention; only the order within ties varies, which is cosmetic | Re-open if users report confusion about ordering within ties |
| AGG-8 (ROUND(score,2)=100 may miss edge-case ACs) | LOW | PostgreSQL ROUND is exact for decimal values; the floating-point drift scenario requires extremely unusual score values | Re-open if a submission with score 99.995+ is incorrectly classified as non-AC |
