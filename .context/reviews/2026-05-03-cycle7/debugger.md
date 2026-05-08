# Debugger Review — Cycle 7

**Date:** 2026-05-03
**HEAD reviewed:** `d2a85df8`

## Findings

### C7-DB-1: Brute-force lockout counter accumulates without reset — silent denial of service (MEDIUM, High confidence)

**File:** `src/lib/assignments/recruiting-invitations.ts`

**Failure scenario:** A candidate receives a recruiting link. Over the course of a week:
1. Day 1: Tries wrong password 2 times, succeeds on 3rd attempt. Counter = 2 (not reset).
2. Day 3: Password manager auto-fills old password 2 times before succeeding. Counter = 4.
3. Day 5: One typo on login. Counter = 5. Locked out permanently.

The candidate sees "tokenLocked" error with no recourse. No admin UI exists to reset the counter. The invitation is effectively bricked.

**Root cause:** `incrementFailedRedeemAttempt` increments unidirectionally; `redeemRecruitingToken` never decrements or resets the counter on success.

**Fix:** Reset `_sys.failedRedeemAttempts` to 0 after successful password verification in the re-entry path (around line 489). Also consider resetting after successful initial redeem (around line 623).

---

### C7-DB-2: generateMetadata/page body state divergence causes confusing UX (LOW, High confidence)

**File:** `src/app/(auth)/recruit/[token]/page.tsx`

**Failure scenario:** A candidate with an expired-but-redeemed token visits the page. The browser tab shows "Expired" (from generateMetadata line 38-39) but the page body shows the re-entry form. The candidate is confused by the mismatched signals.

**Root cause:** The `isRedeemed` bypass was added to the page body (C6-3 fix) but not to `generateMetadata`.

**Fix:** Apply the same `isRedeemed` check in `generateMetadata` before the expiry check.

---

### C7-DB-3: Rate limiting gap on recruit start page allows token enumeration (MEDIUM, High confidence)

**File:** `src/app/(auth)/recruit/[token]/page.tsx`

**Failure scenario:** An attacker generates candidate tokens (24-byte base64url, 192 bits of entropy) and tests them against `/recruit/{guess}` at high volume. Without rate limiting, they can observe different response cards to distinguish invalid tokens from valid/expired/redeemed ones.

While the token space is large enough that brute-force is impractical, the lack of rate limiting is inconsistent with the defense-in-depth applied to the results page and API endpoint. It also enables targeted attacks where an attacker has partial knowledge of a token.

**Fix:** Add `checkServerActionRateLimit` with the same parameters as the results page.
