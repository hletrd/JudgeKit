# RPF Cycle 9 -- Aggregate Review (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `44793bd5` (fix(recruit): stop incrementing brute-force counter on alreadyRedeemed race)
**Review scope:** Full codebase (~574 TypeScript files, 100+ API routes). Deep review of auth, security, recruiting, submissions, rate-limiting, server actions, and proxy modules.

**Review lanes covered (single-agent deep review):** code-quality, security, performance, architecture, correctness/verification, test-coverage, tracing, documentation, UI/UX (source-level).

---

## Total deduplicated NEW findings

**1 HIGH, 6 MEDIUM, 5 LOW NEW.** Details below.

---

## NEW findings this cycle

### C9-1 (HIGH) -- Duplicate `getDbNowUncached()` calls create inconsistent timestamps in `toggleUserActive`

**File:** `src/lib/actions/user-management.ts:110-115`
**Confidence:** HIGH
**Category:** Correctness / Race condition

In `toggleUserActive()`, when deactivating a user, `getDbNowUncached()` is called twice in quick succession:

```ts
if (!isActive) {
  updates.tokenInvalidatedAt = await getDbNowUncached();  // call #1
}
await db.update(users)
  .set(withUpdatedAt(updates, await getDbNowUncached()))   // call #2 (inside withUpdatedAt)
  .where(eq(users.id, userId));
```

If the DB server time advances between the two calls, `tokenInvalidatedAt` and `updatedAt` will have different values within the same logical update. This is inconsistent because they should represent the same instant. More critically, `tokenInvalidatedAt` could be *older* than `updatedAt`, meaning the JWT refresh callback (which compares `authenticatedAt` against `tokenInvalidatedAt`) might not invalidate the session properly if the gap is small enough to fall within clock-skew tolerance.

The same pattern appears in `editUser` at line 302/315 and `changePassword` at line 73/74.

**Fix:** Call `getDbNowUncached()` once, store the result, and reuse it for both `tokenInvalidatedAt` and `withUpdatedAt`. This is already done correctly in `createUser` (line 403).

**Failure scenario:** Admin deactivates user; `tokenInvalidatedAt = T1`, `updatedAt = T2` where T2 > T1. If the user's JWT `authenticatedAt` is between T1 and T2, the token may not be properly invalidated because `isTokenInvalidated` compares against `tokenInvalidatedAt` (T1) but the row was actually updated at T2. Under DB clock skew this window could be several milliseconds, which is small but real.

---

### C9-2 (MEDIUM) -- `compileOutput` exposed in POST /api/v1/submissions response for non-owners

**File:** `src/app/api/v1/submissions/route.ts:334-347`
**Confidence:** MEDIUM
**Category:** Security / Information disclosure

After creating a submission, the route fetches and returns the full submission row including `compileOutput`:

```ts
const [submission] = await db.select({
  ...
  compileOutput: submissions.compileOutput,
  ...
}).from(submissions).where(eq(submissions.id, id)).limit(1);
return apiSuccess(submission, { status: 201 });
```

For the submission *creator* this is acceptable (they submitted the code). However, the GET endpoint at the same route (`/api/v1/submissions`) also includes `compileOutput` in its select (line 88), and the list endpoint does not apply `sanitizeSubmissionForViewer`. The list endpoint only filters by `userId` for non-admins (line 46), so the owner will always see their own `compileOutput` in both GET list and POST create -- this is fine.

But there is a subtler issue: if the `canAccessSubmission` check is ever bypassed or relaxed for the GET-by-ID endpoint, `compileOutput` would leak without going through `sanitizeSubmissionForViewer`. The POST response also returns `compileOutput` unconditionally without checking problem visibility settings (`showCompileOutput`). If a problem has `showCompileOutput = false`, the submission creator still sees `compileOutput` in the POST-201 response even though they should not.

**Fix:** Apply `sanitizeSubmissionForViewer` to the POST response as well, or at minimum strip `compileOutput` when `problem.showCompileOutput === false`.

---

### C9-3 (MEDIUM) -- Recruiting results page does not verify `isRecruitingCandidate` status

**File:** `src/app/(auth)/recruit/[token]/results/page.tsx:103-104`
**Confidence:** MEDIUM
**Category:** Security / Authorization gap

The results page checks that the session user ID matches the invitation's user ID, but does not verify that the user is actually a recruiting candidate via `getRecruitingAccessContext`. A non-recruiting student who somehow obtains a valid token and has their `userId` set as the invitation's `userId` (via a different invitation or manual DB edit) could view results intended for recruiting candidates only.

This is a defense-in-depth concern rather than a direct exploit, since the `userId` on the invitation must match, but the `isRecruitingCandidate` check is used elsewhere (e.g., leaderboard visibility, problem access) and should be consistent.

**Fix:** Add `getRecruitingAccessContext(session.user.id)` check and verify `isRecruitingCandidate` or at minimum that the user's invitation matches the token's assignment.

---

### C9-4 (MEDIUM) -- `incrementFailedRedeemAttempt` and `resetFailedRedeemAttempt` run outside transaction, may silently fail

**File:** `src/lib/assignments/recruiting-invitations.ts:64-80, 93-106`
**Confidence:** MEDIUM
**Category:** Security / Correctness

These functions use `void` fire-and-forget calls (`void incrementFailedRedeemAttempt(token)` at lines 513, 541, 590, 657) and catch errors with only `logger.warn`. If the DB is temporarily unreachable or the update fails, the brute-force counter is not incremented (or not reset), which means:

1. **Failed attempt not counted:** An attacker could brute-force a token more than `MAX_FAILED_REDEEM_ATTEMPTS` times if the counter updates consistently fail.
2. **Counter not reset on success:** A legitimate user who succeeds after a few failures will have those failures persist, eventually locking them out without admin recovery.

The current code documents this as "best-effort", but the security implication of the first case is significant.

**Fix:** For `incrementFailedRedeemAttempt`, consider retrying once or making the increment synchronous (inside the transaction) at the cost of a slightly different error handling flow. For `resetFailedRedeemAttempt`, a failed reset is less critical since it only means the counter doesn't go back to zero, but it should be logged at `error` level rather than `warn`.

---

### C9-5 (MEDIUM) -- `changePassword` does not clear rate limit on failure path

**File:** `src/lib/actions/change-password.ts:47-48`
**Confidence:** MEDIUM
**Category:** Security / Availability

The `changePassword` function uses `consumeRateLimitAttemptMulti` (atomic check+increment) at line 47. If the user fails to verify their current password (line 56), the rate limit counter is incremented but never cleared. This is correct behavior -- failed attempts should count toward the limit.

However, the rate limit is *cleared* on success (line 81), which is also correct. But between `consumeRateLimitAttemptMulti` (which increments the counter) and the actual password verification, the counter has already been incremented. If the user enters the wrong current password, the counter is incremented once. If they then enter the correct current password but an invalid new password (fails `getPasswordValidationError` at line 62), the counter has been incremented but the password was not changed -- and the rate limit is NOT cleared (because we return early at line 63).

This means a user who correctly authenticates but provides an invalid new password format gets dinged against their rate limit, which could contribute to an account lockout. The fix would be to clear the rate limit when the current password is verified correctly, even if the new password fails validation.

**Fix:** Clear the rate limit after successful current-password verification (before the new-password validation), or restructure so the rate limit is only consumed when both checks pass.

---

### C9-6 (MEDIUM) -- `deleteUserPermanently` lacks `withUpdatedAt` and may leave stale cache

**File:** `src/lib/actions/user-management.ts:211`
**Confidence:** MEDIUM
**Category:** Consistency

The `deleteUserPermanently` function does a hard delete (`db.delete(users).where(...)`) which is fine for removing the user record. However, the audit event is recorded at line 197 *before* the deletion. If the deletion fails (e.g., FK constraint not caught), the audit log shows a deletion that never happened. Also, any in-process auth cache (proxy.ts `authUserCache`) may still have the deleted user cached for up to `AUTH_CACHE_TTL_MS` (2s) after deletion.

The cache staleness is already documented in proxy.ts as a known tradeoff. The audit-before-delete ordering is the real issue.

**Fix:** Record the audit event after the successful deletion, or use a transaction that wraps both the audit recording and the deletion so they succeed or fail together.

---

### C9-7 (MEDIUM) -- `checkServerActionRateLimit` uses `getDbNowUncached` while `atomicConsumeRateLimit` uses `getDbNowMs`

**File:** `src/lib/security/api-rate-limit.ts:254` vs `src/lib/security/api-rate-limit.ts:78`
**Confidence:** MEDIUM
**Category:** Consistency

`checkServerActionRateLimit` uses `(await getDbNowUncached()).getTime()` (app-server JS timestamp from DB query result) while `atomicConsumeRateLimit` uses `await getDbNowMs()` (returns raw DB-server milliseconds). Both contact the DB for time, but the code paths diverge in how they process the result:

- `getDbNowMs()` returns `bigint` cast to `number`
- `getDbNowUncached()` returns a JS `Date` object, then `.getTime()` converts to ms

The timestamps should be equivalent, but the dual code paths make maintenance harder and could diverge if either function's implementation changes. The orientation comment at the top of the file (added cycle 8) mentions this module pair should be kept in sync, but the time-source inconsistency within the *same file* is a new observation.

**Fix:** Unify on `getDbNowMs()` throughout `api-rate-limit.ts` for consistency, since it avoids the `Date` intermediary and is used by `atomicConsumeRateLimit` already.

---

### C9-8 (LOW) -- Recruiting start page renders metadata for expired-but-redeemed tokens without rate-limit check

**File:** `src/app/(auth)/recruit/[token]/page.tsx:26-68`
**Confidence:** LOW
**Category:** Security / Information disclosure

The `generateMetadata` function (lines 26-68) calls `getCachedInvitation(token)` without the rate-limit check that the main page component applies (lines 84-92). An attacker making many HEAD/GET requests to `/recruit/[token]` can trigger DB lookups via `generateMetadata` without hitting the rate limiter, because `generateMetadata` runs before the page component.

In practice, Next.js typically runs `generateMetadata` and the page component in the same render, and React.cache() deduplicates the DB query, so the actual DB load is similar. But the rate-limit counter is only incremented in the page component, not in `generateMetadata`, meaning a bot issuing HEAD requests (which only trigger metadata) may bypass the rate limit.

**Fix:** Apply the same `checkServerActionRateLimit` call in `generateMetadata`, or document that HEAD requests are not rate-limited and rely on the page-level rate limit for full GET requests.

---

### C9-9 (LOW) -- `sanitizeSubmissionForViewer` hidden DB query can cause N+1 in bulk contexts

**File:** `src/lib/submissions/visibility.ts:90-96`
**Confidence:** LOW
**Category:** Performance

The JSDoc already documents this issue ("Hidden DB query... Callers that already have this data should pass it via assignmentVisibility"), but no current caller passes `assignmentVisibility` when fetching submission lists. The GET /api/v1/submissions list endpoint (which can return up to 100 submissions per page) does not call `sanitizeSubmissionForViewer` at all -- it returns raw submission data. The GET /api/v1/submissions/[id] endpoint calls it but for a single submission, so N+1 is not an issue there.

This is low priority because the only caller is the single-submission endpoint, but if a future bulk endpoint adds sanitization, the N+1 will be triggered.

**Fix:** Pre-fetch assignment visibility settings when the list endpoint adds sanitization in the future.

---

### C9-10 (LOW) -- `proxy.ts` auth cache uses `Date.now()` instead of DB time

**File:** `src/proxy.ts:64, 79, 91`
**Confidence:** LOW
**Category:** Consistency

The proxy middleware's `authUserCache` uses `Date.now()` for cache TTL expiration and entry timestamps. Since the proxy runs in Edge Runtime and cannot make DB queries, this is expected. However, the comment at `src/lib/db-time.ts:45` says "Use this instead of Date.now() in any server-side code that compares against DB timestamps." The proxy is the one exception since Edge Runtime cannot use `getDbNowMs()`.

**Fix:** Add a code comment at each `Date.now()` usage in proxy.ts noting this is an intentional exception because Edge Runtime cannot access the DB.

---

### C9-11 (LOW) -- Contest detail page creates `new Date()` from DB timestamps for client-side comparison

**File:** `src/app/(public)/contests/[id]/page.tsx:134-137, 171-172`
**Confidence:** LOW
**Category:** Correctness / Clock skew

The enrolled student view creates `new Date(contest.startsAt)` and `new Date(contest.deadline)` and compares them against `now` (from `getDbNow()`). This introduces potential clock skew between the JS Date parsing and the DB time. However, since `getDbNow()` returns DB time and the comparison is against DB-stored timestamps, the skew is between the DB clock and itself (when the value was stored vs. when `getDbNow()` was called), which is acceptable for display purposes.

**Fix:** Low priority. For critical operations (exam start/end), the SQL-level NOW() checks in the transaction are the authoritative gates, and the JS-level checks here are only for UI display.

---

## Resolved at current HEAD (verified by inspection)

All previously resolved items from cycles 1-8 remain resolved at HEAD `44793bd5`.

## Carry-forward deferred items (unchanged)

- F3 (MEDIUM): Candidate PII encryption at rest -- schema migration needed
- F5 (MEDIUM): JWT callback DB query optimization -- auth caching design required
- F6 (LOW): Production deployment lag -- operator action
- F8 (LOW): API route rate limiting -- gradual hardening
- F10 (LOW): File validation test coverage -- ongoing
- C6-7 (LOW): Compiler stdin newline appending inconsistency
- C6-8 (LOW): Misleading public route group for auth submission detail
- C6-9 (LOW): CSRF origin rejection impact on non-browser clients
- C6-10 (LOW): Privacy page hardcoded retention periods
- AGG-7/8/9 (LOW): Missing unit tests for resetFailedRedeemAttempt, submission visibility guard, sidecar failover
- Various carried-forward deferred test gaps
- 24 pre-existing test failures -- investigation needed
