# Debugger Review — Cycle 8

## Findings

### C8-DBG-1: `editUser` self-edit password block — confirmed logic bug
- **File**: `src/lib/actions/user-management.ts` lines 258-273
- **Severity**: MEDIUM | **Confidence**: High
- **Issue**: Tracing the flow: admin calls `editUser(adminId, { ..., password: "newPass" })`. At line 262, the check `targetUser.id !== session.user.id && targetLevel >= actorLevel` is false (self-edit), so it passes. At line 270, `data.password` is truthy and `targetUser.role` is set, so line 271 checks `targetLevel >= actorLevel` which is true (self), returning "unauthorized". The admin cannot change their own password via this server action.
- **Fix**: Add `targetUser.id !== session.user.id` guard at line 270, or restructure to handle self-edit explicitly before the role-escalation checks.

### C8-DBG-2: `redeemRecruitingToken` error path increments counter for "alreadyRedeemed" — double-penalty
- **File**: `src/lib/assignments/recruiting-invitations.ts` lines 620-672
- **Severity**: LOW | **Confidence**: High
- **Issue**: When the atomic claim fails with "alreadyRedeemed" (concurrent claim by another request), the transaction rolls back and the error is caught at line 668. At line 671, `incrementFailedRedeemAttempt` is called, incrementing the brute-force counter. But this scenario is not a brute-force attempt — it's a legitimate race condition where two requests tried to redeem the same token simultaneously. The counter increment is a false positive that moves the legitimate user closer to lockout.
- **Fix**: Only increment the failed-redeem counter for actual authentication failures, not for concurrent-claim races. The "alreadyRedeemed" error should be returned without incrementing.

### C8-DBG-3: `clearRateLimitMulti` on successful credential login could enable distributed brute-force
- **File**: `src/lib/auth/config.ts` line 297
- **Severity**: LOW | **Confidence**: Medium
- **Issue**: On successful credential login, `clearRateLimitMulti` clears both the IP and username rate limits. This is correct for the legitimate user but also clears any accumulated failed attempts from a different attacker using the same username. In a targeted username brute-force scenario (where the attacker knows the username), the legitimate user's successful login clears the username-based counter, effectively giving the attacker a fresh set of attempts.
- **Fix**: Consider only clearing the IP rate limit on success, not the username rate limit. The username counter should decay naturally via the window mechanism rather than being reset on success. However, this tradeoff (convenience vs security) needs careful consideration — flag as low since the current behavior is standard practice.

### C8-DBG-4: `sanitizeSubmissionForViewer` hidden DB query could cause N+1 in batch contexts
- **File**: `src/lib/submissions/visibility.ts` lines 85-101
- **Severity**: MEDIUM | **Confidence**: High
- **Issue**: When `assignmentVisibility` is not provided and the submission has an `assignmentId`, `sanitizeSubmissionForViewer` queries the `assignments` table (line 90). The JSDoc warns about this, but the function is called from submission list endpoints where it could be called per-submission in a loop. For the GET /api/v1/submissions endpoint, the function is NOT called (the endpoint returns raw data), but the submission detail endpoint at /api/v1/submissions/[id] DOES call it. The risk is that future batch consumers will call it in a loop without passing `assignmentVisibility`.
- **Fix**: Make `assignmentVisibility` a required parameter, or add a batch variant that pre-fetches assignment visibility.
