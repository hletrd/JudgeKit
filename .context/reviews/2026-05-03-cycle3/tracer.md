# Tracer Review — Cycle 3 (2026-05-03)

**HEAD reviewed:** `ae528d9b`

---

## C3-TR-1 (HIGH, HIGH) — Concurrent brute-force race on failed redeem counter (agrees with C3-SEC-1, C3-CR-1, C3-DBG-1)

**Causal trace:**
1. Attacker obtains a valid recruiting token (single-factor auth).
2. Attacker sends N concurrent POST requests to `/recruit/[token]` with wrong passwords.
3. All N requests hit `redeemRecruitingToken` concurrently.
4. In the re-entry path, `verifyAndRehashPassword` fails for all N requests.
5. Each request calls `void incrementFailedRedeemAttempt(token)` (fire-and-forget).
6. All N calls to `incrementFailedRedeemAttempt` run concurrently:
   a. Each SELECTs the invitation metadata → reads `_failedRedeemAttempts=0`
   b. Each computes `0 + 1 = 1`
   c. Each UPDATEs metadata with `_failedRedeemAttempts=1`
7. Counter stays at 1, never reaches 5.
8. All subsequent attempts also pass the counter check (line 392: `failedAttempts >= MAX_FAILED_REDEEM_ATTEMPTS` is false).

**Competing hypothesis:** The IP rate limiter might catch this. **Refuted:** The IP rate limiter applies per-IP. An attacker with multiple IPs (proxy pool) bypasses it. The per-token counter was specifically designed to handle this case, but it's broken under concurrency.

**Conclusion:** The brute-force lockout is ineffective against concurrent attacks. Fix requires atomic SQL update.

---

## C3-TR-2 (MEDIUM, HIGH) — Initial redeem password brute-force gap (agrees with C3-SEC-2, C3-CR-5, C3-DBG-2)

**Causal trace:**
1. Attacker has a valid unused token.
2. Attacker sends requests with various `accountPassword` values.
3. `getPasswordValidationError` rejects weak passwords (returns error at line 519).
4. No `incrementFailedRedeemAttempt` call is made.
5. Attacker can try unlimited passwords until one passes validation rules.
6. Once a valid-strength password is found, the token is redeemed successfully.

**Contrast with re-entry path:** The re-entry path (line 446-452) correctly calls `incrementFailedRedeemAttempt` on wrong password. The initial path does not.

---

## C3-TR-3 (LOW, MEDIUM) — Metadata namespace collision (agrees with C3-CRIT-3)

**Causal trace:**
1. `createRecruitingInvitation` accepts `metadata?: Record<string, string>` from the API.
2. `bulkCreateRecruitingInvitations` also accepts per-invitation `metadata`.
3. Internal keys (`accountPasswordResetRequired`, `_failedRedeemAttempts`) are stored in the same object.
4. If a caller passes `metadata: { accountPasswordResetRequired: "true" }`, the flag is set without the password actually being reset.
5. On next re-entry, the code at line 399-400 reads this flag and forces a password change, even though no reset was actually performed.

**Mitigation:** The `_failedRedeemAttempts` key starts with `_`, but `accountPasswordResetRequired` does not. Adding a namespace prefix (`_sys.`) would prevent collisions.
