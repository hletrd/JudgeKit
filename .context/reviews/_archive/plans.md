# Implementation Plans — Cycle 13

## Status

Cycle 13 found **2 new actionable findings** (1 MEDIUM, 1 LOW).

## New Plans

### Plan 1: Fix resend-verification route to require authentication (C13-1)

**File:** `src/app/api/v1/auth/resend-verification/route.ts`
**Severity:** MEDIUM
**Description:** The endpoint is a raw route handler without `createApiHandler`. Anyone can trigger verification emails for arbitrary user IDs.

**Implementation:**
1. Wrap the route in `createApiHandler({ auth: true, rateLimit: "auth:resend-verification", schema: resendSchema, handler: ... })`
2. In the handler, verify `body.userId === user.id` to prevent sending emails for other users
3. Keep the existing rate limiting logic (IP-based + user-based via `consumeRateLimitAttemptMulti`)
4. Update the error response types to match the existing API contract

**Commit message:** `fix(auth): 🐛 require authentication on resend-verification endpoint`

---

### Plan 2: Add rate limiting to groups/[id]/assignments GET (C13-2)

**File:** `src/app/api/v1/groups/[id]/assignments/route.ts`
**Severity:** LOW
**Description:** The GET handler for listing group assignments lacks rate limiting.

**Implementation:**
1. Add `consumeApiRateLimit(request, "assignments:list")` at the start of the GET handler
2. Or refactor to use `createApiHandler` wrapper for consistency

**Commit message:** `fix(api): 🐛 add rate limit to group assignments list endpoint`

---

## Deferred Items (retained from prior cycles)

None — all prior findings are fixed.
