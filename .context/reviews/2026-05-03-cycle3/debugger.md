# Debugger Review — Cycle 3 (2026-05-03)

**HEAD reviewed:** `ae528d9b`

---

## C3-DBG-1 (HIGH, HIGH) — Race condition in `incrementFailedRedeemAttempt` defeats brute-force lockout

**File:** `src/lib/assignments/recruiting-invitations.ts:34-55`

The function reads metadata, modifies it in JS, and writes it back. Under concurrent failed redeems for the same token, the counter increment is lost. This is a classic TOCTOU race condition.

**Reproduction:**
1. Create a recruiting invitation with token T.
2. Send 5+ concurrent POST requests to `/recruit/T` with wrong passwords.
3. All requests read `_failedRedeemAttempts=0` simultaneously.
4. All increment to 1 and write back 1.
5. Counter never reaches 5, lockout never triggers.

**Fix:** Atomic SQL update with `jsonb_set` as described in C3-SEC-1.

---

## C3-DBG-2 (MEDIUM, HIGH) — Missing `incrementFailedRedeemAttempt` call on initial redeem password validation failure

**File:** `src/lib/assignments/recruiting-invitations.ts:512-519`

When `getPasswordValidationError(accountPassword)` returns an error during initial redeem, the function returns the error without incrementing the brute-force counter. This creates an asymmetric gap: the re-entry path increments the counter on wrong password, but the initial redeem path does not.

**Failure mode:** An attacker with a valid token can try unlimited passwords on the initial redeem path. Even with the IP rate limiter, a distributed attack (multiple IPs, same token) bypasses it.

**Fix:** Add `void incrementFailedRedeemAttempt(token)` before the return at line 519.

---

## C3-DBG-3 (LOW, MEDIUM) — `incrementFailedRedeemAttempt` silently swallows all errors

**File:** `src/lib/assignments/recruiting-invitations.ts:51-54`

The catch block logs a warning and returns. If the DB is unreachable, the counter never increments, and the lockout is effectively disabled. This is by design ("best-effort: don't let counter update failures block the auth flow"), but it means a DB outage during an active brute-force attack disables the lockout.

**Fix:** Consider a fallback: if the counter update fails, return an error from `redeemRecruitingToken` instead of silently proceeding. Alternatively, rate-limit based on the IP alone (which already works) and treat the per-token counter as a soft defense-in-depth.
