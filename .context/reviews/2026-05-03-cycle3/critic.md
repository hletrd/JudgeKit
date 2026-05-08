# Critic Review — Cycle 3 (2026-05-03)

**HEAD reviewed:** `ae528d9b`

---

## C3-CRIT-1 (HIGH, HIGH) — Concurrent brute-force lockout bypass (agrees with C3-SEC-1, C3-CR-1)

The `incrementFailedRedeemAttempt` counter is the sole defense against token brute-force (per the cycle 2 fix). But the counter update is not atomic — it reads, modifies in JS, and writes back. Under concurrent requests, the counter is effectively a suggestion, not a gate. This undermines the entire brute-force protection that was the highest-severity fix from cycle 2.

**Severity justification:** The per-invitation lockout was introduced specifically to address C2-F1 (HIGH). If it can be trivially bypassed by sending concurrent requests, the original HIGH finding is still open.

---

## C3-CRIT-2 (MEDIUM, HIGH) — Initial redeem path does not protect against password brute-force

**File:** `src/lib/assignments/recruiting-invitations.ts:512-519`

The initial redeem path validates the password format but does not call `incrementFailedRedeemAttempt`. An attacker who has a valid token can try passwords indefinitely until one passes the format rules. The IP-based rate limiter provides some protection, but distributed attacks bypass it.

---

## C3-CRIT-3 (MEDIUM, MEDIUM) — `metadata` namespace collision risk between internal keys and user data

**File:** `src/lib/assignments/recruiting-invitations.ts:25-26`

Two internal keys are stored in the same `metadata` JSONB as user-supplied data:
- `ACCOUNT_PASSWORD_RESET_REQUIRED_KEY = "accountPasswordResetRequired"`
- `FAILED_REDEEM_ATTEMPTS_KEY = "_failedRedeemAttempts"`

If a caller of `createRecruitingInvitation` or `bulkCreateRecruitingInvitations` passes `metadata: { accountPasswordResetRequired: "true" }`, it would set the flag without the user's password actually being reset. The underscore prefix on `_failedRedeemAttempts` helps but is a convention, not enforced.

**Fix:** Reserve internal keys with a prefix like `_sys.` that is rejected at the API input boundary.

---

## C3-CRIT-4 (LOW, HIGH) — Privacy page `mailto:` link missing `rel="nofollow"` (agrees with C3-SEC-4, C3-CR-6)

Same class of issue as C2-F18 which was fixed for the recruiter email. The privacy page email link was missed.

---

## C3-CRIT-5 (LOW, MEDIUM) — `hashToken` duplication across modules

Agrees with C3-CR-4. DRY violation between `recruiting-invitations.ts` and `judge/auth.ts`. If hash algorithm changes, both must be updated in lockstep.
