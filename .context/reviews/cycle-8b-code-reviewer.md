# Code Review — Cycle 8

## Findings

### C8-CR-1: Duplicate rate-limit key-construction pattern
- **File**: `src/lib/security/rate-limit.ts` vs `src/lib/security/api-rate-limit.ts`
- **Severity**: MEDIUM | **Confidence**: High
- **Issue**: Both modules implement nearly identical "read existing rate-limit row, check window/blocked, increment or insert" logic. rate-limit.ts has `getEntry()` + per-key update loop; api-rate-limit.ts has its own `atomicConsumeRateLimit()`. The window-reset logic, blockedUntil handling, and consecutiveBlocks tracking are subtly different (api-rate-limit doesn't use consecutiveBlocks). Duplication increases divergence risk.
- **Fix**: Extract shared `atomicConsumeRateLimitRow()` parameterized by backoff strategy.

### C8-CR-2: `editUser` password-reset guard lacks self-edit exclusion
- **File**: `src/lib/actions/user-management.ts` lines 258-273
- **Severity**: LOW | **Confidence**: High
- **Issue**: `editUser` checks `targetLevel >= actorLevel` at line 262 (with `targetUser.id !== session.user.id` guard) for general authorization, then checks `targetLevel >= actorLevel` again at line 271 for password-reset without the self-edit guard. An admin editing their own profile with a password field would hit "unauthorized" — a self-edit bug.
- **Fix**: Add `targetUser.id !== session.user.id` guard to the password-reset block.

### C8-CR-3: `recordRateLimitFailure` and `recordRateLimitFailureMulti` appear unused
- **File**: `src/lib/security/rate-limit.ts` lines 242-318
- **Severity**: LOW | **Confidence**: High
- **Issue**: These non-atomic rate-limit functions have no callers. The atomic `consumeRateLimitAttemptMulti` is used instead. Dead code risks accidental use of the non-atomic path.
- **Fix**: Remove or deprecate with JSDoc directing to `consumeRateLimitAttemptMulti`.

### C8-CR-4: `formatScore` called without locale in recruit results page
- **File**: `src/app/(auth)/recruit/[token]/results/page.tsx` lines 249, 303
- **Severity**: MEDIUM | **Confidence**: High
- **Issue**: `formatScore(totalScore)` and `formatScore(totalPossible)` at lines 249 and 303 don't pass `locale`, even though `locale` is in scope and `formatScore` accepts it. Causes inconsistent number formatting in non-English locales.
- **Fix**: Pass `locale` to all `formatScore` calls in this file.

### C8-CR-5: Contest detail page fetches `compileOutput` without visibility check
- **File**: `src/app/(public)/contests/[id]/page.tsx` lines 143-148
- **Severity**: MEDIUM | **Confidence**: High
- **Issue**: The student submission list query selects `compileOutput` which could contain detailed compiler error messages. The problem's `showCompileOutput` setting is not checked for this query, potentially leaking compile output that should be hidden.
- **Fix**: Apply `sanitizeSubmissionForViewer` to these submissions or omit `compileOutput` when not needed.

### C8-CR-6: Public contest page makes unconditional analytics/replay computation
- **File**: `src/app/(public)/contests/[id]/page.tsx` lines 449-455
- **Severity**: MEDIUM | **Confidence**: Medium
- **Issue**: When `showArchiveInsights` is true, `computeContestAnalytics`, `computeLeaderboard`, and `computeContestReplay` run on every page load with no caching. For large expired contests, these are expensive queries that can cause slow page loads or DB load spikes.
- **Fix**: Add time-based or request-scoped caching for expired contest analytics.

### C8-CR-7: `updateRecruitingInvitation` uses untyped updates
- **File**: `src/lib/assignments/recruiting-invitations.ts` lines 301-323
- **Severity**: LOW | **Confidence**: High
- **Issue**: The `updates` variable at line 301 is typed as `Record<string, unknown>`, losing type safety for the DB update. A typo in a key name (e.g., `expiredAt` instead of `expiresAt`) would not be caught by TypeScript.
- **Fix**: Type `updates` using the Drizzle inferred type from the table schema.
