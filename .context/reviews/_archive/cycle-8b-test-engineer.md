# Test Engineer Review — Cycle 8

## Findings

### C8-TE-1: Missing test for `editUser` self-edit with password
- **File**: `src/lib/actions/user-management.ts` lines 258-273
- **Severity**: MEDIUM | **Confidence**: High
- **Issue**: The `editUser` function has a bug where an admin editing their own profile with a password field gets "unauthorized" because the password-reset guard at line 271 lacks the self-edit exclusion. There is no test covering the "admin edits own profile + changes password" scenario. This bug would have been caught by a basic self-edit test.
- **Fix**: Add test: admin edits own profile with password change -> should succeed.

### C8-TE-2: Missing test for `resetFailedRedeemAttempt` concurrency with `incrementFailedRedeemAttempt`
- **File**: `src/lib/assignments/recruiting-invitations.ts` lines 93-106
- **Severity**: MEDIUM | **Confidence**: Medium
- **Issue**: `resetFailedRedeemAttempt` runs fire-and-forget after successful auth. There is no test verifying that a concurrent increment+reset produces a consistent counter state. The race condition described in C8-SEC-2 should be validated with a concurrent test.
- **Fix**: Add concurrency test for reset vs increment race.

### C8-TE-3: Missing test for `checkServerActionRateLimit` lacking blockedUntil
- **File**: `src/lib/security/api-rate-limit.ts` lines 241-307
- **Severity**: LOW | **Confidence**: High
- **Issue**: `checkServerActionRateLimit` doesn't enforce `blockedUntil`, meaning it cannot impose a cooldown. There are no tests verifying the absence of a cooldown period. A test that hits the limit, then verifies the next request within the same window is also rejected, would confirm the current behavior (rejection) but a test checking behavior after window expiry would reveal that the counter resets to 0 immediately with no escalating block.
- **Fix**: Add test verifying rate-limit window behavior and document the no-cooldown limitation.

### C8-TE-4: Missing test for `formatScore` locale parameter
- **File**: `src/app/(auth)/recruit/[token]/results/page.tsx`
- **Severity**: LOW | **Confidence**: High
- **Issue**: The `formatScore` calls in the recruit results page don't pass locale. There's no test that verifies `formatScore` with different locales produces different output, which would catch this bug.
- **Fix**: Add locale-specific test for `formatScore`.

### C8-TE-5: No test for recruiting token auth rate-limit consumption on invalid tokens
- **File**: `src/lib/auth/config.ts` lines 204-213
- **Severity**: LOW | **Confidence**: Medium
- **Issue**: There's no test verifying that sending invalid recruiting tokens consumes rate-limit slots. This is the expected behavior but should be explicitly tested and documented, especially since it differs from how some might expect the system to work (cheap reject for obviously invalid tokens).
- **Fix**: Add test for rate-limit consumption on invalid recruiting tokens.
