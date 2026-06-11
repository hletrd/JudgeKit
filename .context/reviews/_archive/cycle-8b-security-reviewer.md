# Security Review — Cycle 8

## Findings

### C8-SEC-1: Recruiting token brute-force: IP rate limit consumed before token validation
- **File**: `src/lib/auth/config.ts` lines 204-213
- **Severity**: MEDIUM | **Confidence**: High
- **Issue**: In the recruiting token auth path, `consumeRateLimitAttemptMulti(recruitIpKey)` is called at line 206 BEFORE the token is validated at line 215. This means every request — even with a completely invalid token — consumes a rate-limit slot. An attacker sending tokens with invalid format or obviously wrong tokens will burn through the IP rate limit quickly, potentially locking out a legitimate candidate behind the same IP (NAT/corporate proxy). For normal credential login, the same pattern exists but is acceptable because passwords are cheap to verify. For recruiting tokens, the token itself is the secret, so consuming a rate-limit slot before even checking format is wasteful.
- **Fix**: Consider a lightweight format check before consuming the rate-limit slot, or add a separate lower-threshold rate limit for obviously-invalid tokens.

### C8-SEC-2: `resetFailedRedeemAttempt` fire-and-forget can mask concurrent lockout bypass
- **File**: `src/lib/assignments/recruiting-invitations.ts` lines 93-106, 541
- **Severity**: MEDIUM | **Confidence**: Medium
- **Issue**: `resetFailedRedeemAttempt` is called with `void` (fire-and-forget) at line 541 after successful re-entry. This reset happens OUTSIDE the transaction. If a concurrent failed-redeem attempt arrives between the successful re-entry and the reset, the counter could be incremented after being reset, leaving the counter at 1 instead of 0. In a targeted attack scenario, an attacker who knows the password could attempt a failed redeem (incrementing to 5 = locked), then immediately do a successful re-entry which resets to 0, but the attacker's concurrent increment that was in-flight could write the counter back to 1 — leaving the legitimate user's counter non-zero for the next failed attempt to build on.
- **Fix**: Move the reset inside the transaction, or use the same atomic `jsonb_set` pattern to set the counter to 0 atomically (which it already does, but the race is between the read-modify-write of the increment and the reset).

### C8-SEC-3: Missing `X-Content-Type-Options: nosniff` on API responses
- **File**: `src/lib/api/handler.ts` lines 189-192
- **Severity**: LOW | **Confidence**: High
- **Issue**: The `createApiHandler` wrapper sets `Cache-Control: no-store` but doesn't set `X-Content-Type-Options: nosniff`. Without this header, browsers may MIME-sniff API responses, potentially interpreting JSON as HTML. While the risk is low (API responses are JSON with proper Content-Type), adding `nosniff` is defense-in-depth.
- **Fix**: Add `X-Content-Type-Options: nosniff` to all API responses in the handler.

### C8-SEC-4: `contactEmail` on recruit results page rendered without sanitization
- **File**: `src/app/(auth)/recruit/[token]/results/page.tsx` line 316
- **Severity**: LOW | **Confidence**: High
- **Issue**: The `contactEmail` from the assignments table is rendered directly into a `mailto:` href. While Next.js JSX escapes HTML, the email value could contain newlines or other characters that break the mailto: URI. The value is admin-controlled (low risk) but should still be validated.
- **Fix**: Validate the email format before rendering, or at minimum strip newlines.

### C8-SEC-5: JWT callback DB query on every request without caching
- **File**: `src/lib/auth/config.ts` lines 403-416
- **Severity**: MEDIUM | **Confidence**: High
- **Issue**: The JWT callback runs `db.query.users.findFirst` on every JWT refresh cycle (every request when the JWT needs refreshing). For high-traffic scenarios, this creates a DB query per active session per refresh window. This is a known deferred item (F5 from prior cycles) but the performance impact also has a security dimension: under DDoS, the DB queries from JWT refreshes amplify the load on PostgreSQL, potentially causing service degradation.
- **Fix**: (Deferred from prior cycles — needs auth caching design.)

### C8-SEC-6: `checkServerActionRateLimit` doesn't enforce blockedUntil
- **File**: `src/lib/security/api-rate-limit.ts` lines 241-307
- **Severity**: MEDIUM | **Confidence**: High
- **Issue**: Unlike `consumeRateLimitAttemptMulti` and `atomicConsumeRateLimit`, `checkServerActionRateLimit` does not set or check `blockedUntil`. It only increments `attempts` and compares against `maxRequests`. This means it cannot impose a cooldown period after the limit is hit — once the window expires, the counter resets to 0 immediately. For server actions like `deleteUserPermanently` (rate limited to 5/minute at line 156 of user-management.ts), this means an attacker can delete 5 users per minute indefinitely with no escalating block.
- **Fix**: Add `blockedUntil` tracking to `checkServerActionRateLimit`, similar to the login rate-limit pattern.
