# Security Review — Cycle 3 (2026-05-03)

**HEAD reviewed:** `ae528d9b`
**Scope:** OWASP top 10, secrets, unsafe patterns, auth/authz, data protection.

---

## C3-SEC-1 (HIGH, HIGH) — `incrementFailedRedeemAttempt` has TOCTOU race — counter can be bypassed by concurrent requests

**File:** `src/lib/assignments/recruiting-invitations.ts:34-55`

The function reads `metadata` from DB, modifies it in JavaScript, then writes it back. Two concurrent failed redeems for the same token both read the same counter value, increment to the same result, and write it back — losing one increment. An attacker making 5+ concurrent requests with wrong passwords can all read counter=0 and all succeed, defeating the brute-force lockout entirely.

**Attack scenario:** Send 10 simultaneous POST requests to `/recruit/[token]` with wrong passwords. All 10 read `_failedRedeemAttempts=0`, increment to 1, and write back 1. The counter never reaches 5.

**Fix:** Use atomic SQL: `UPDATE recruiting_invitations SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{_failedRedeemAttempts}', (COALESCE((metadata->>'_failedRedeemAttempts')::int, 0) + 1)::text) WHERE token_hash = ?`. This ensures the increment is serialized at the DB level.

---

## C3-SEC-2 (MEDIUM, HIGH) — Initial redeem path skips brute-force counter on password validation failure

**File:** `src/lib/assignments/recruiting-invitations.ts:512-519`

When `getPasswordValidationError(accountPassword)` fails during the *initial* redeem, the function returns the validation error without calling `incrementFailedRedeemAttempt`. This means an attacker who has a valid token can try unlimited passwords until one passes the validation rules (length, complexity), then use it to create an account.

**Fix:** Add `void incrementFailedRedeemAttempt(token)` before returning the validation error at line 519. Combine with C3-SEC-1 fix for atomicity.

---

## C3-SEC-3 (MEDIUM, MEDIUM) — `recruiting/validate` endpoint leaks token existence timing via DB query

**File:** `src/app/api/v1/recruiting/validate/route.ts:27-39`

The endpoint hashes the token and queries `recruitingInvitations` by `tokenHash`. If the token doesn't exist, the query returns empty quickly. If it does exist, it also checks `assignments` for the deadline. This timing difference leaks whether a token exists in the DB. While the response is always `{ valid: true }` or `{ valid: false }`, the response time difference is measurable.

**Fix:** Add a small constant-time delay or a dummy DB query on the invalid path to equalize response times. Low priority since token values are 32-byte random strings that are hard to enumerate.

---

## C3-SEC-4 (LOW, HIGH) — Privacy page `mailto:` link lacks `rel="nofollow"`

**File:** `src/app/(public)/privacy/page.tsx:78`

Same class of issue as C2-F18 (recruiter contact email, fixed in commit `42df4c66`). The privacy page has a `mailto:privacy@xylolabs.com` link without spam protection.

**Fix:** Add `rel="nofollow"` to the anchor tag.

---

## C3-SEC-5 (LOW, MEDIUM) — `ALWAYS_REDACT` in export.ts does not redact `judgeWorkers.secretTokenHash` in full-fidelity mode

**File:** `src/lib/db/export.ts:256-262`

In `ALWAYS_REDACT`, `judgeWorkers.secretTokenHash` is NOT included. It IS in `SANITIZED_COLUMNS` (line 252), so sanitized exports are safe. But full-fidelity backup exports include `secretTokenHash` in plaintext. If a full-fidelity backup is leaked, an attacker gets worker authentication secrets.

This is by design for disaster recovery, but the `ALWAYS_REDACT` set should at minimum be documented as intentionally excluding worker secrets, or the secrets should be encrypted at rest in the backup.

**Fix:** Either add `secretTokenHash` and `judgeClaimToken` to `ALWAYS_REDACT` (and document that worker re-registration is required after restore), or add a comment explaining why they are excluded.

---

## C3-SEC-6 (LOW, MEDIUM) — `DATABASE_PATH` derivation for `getDataDir()` is fragile

**File:** `src/lib/files/storage.ts:5-7`

`getDataDir()` resolves `process.env.DATABASE_PATH` parent directory as the data root. If `DATABASE_PATH` is a symlink or has an unusual path structure, this could resolve to an unexpected directory. This is a carry-forward from C2-F13.

**Fix:** Use a dedicated `DATA_DIR` env var instead of deriving from `DATABASE_PATH`.

---

## C3-SEC-7 (INFO, HIGH) — Recruiting token brute-force lockout counter stored in `metadata` JSONB column

**File:** `src/lib/assignments/recruiting-invitations.ts:26`

The `_failedRedeemAttempts` counter is stored inside the `metadata` JSONB column to avoid a schema migration. While pragmatic, this has security implications: (1) the counter is not indexed, making atomic updates harder; (2) user-supplied metadata keys could collide with internal keys (carry-forward from C2-F12). The `ACCOUNT_PASSWORD_RESET_REQUIRED_KEY` is already in the same namespace.

**Fix:** When schema migration is next feasible, move failed-redeem tracking to a dedicated column or separate table. Add a namespace prefix convention (e.g., `_sys.`) for internal metadata keys.
