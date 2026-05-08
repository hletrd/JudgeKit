# Verifier Review — Cycle 3 (2026-05-03)

**HEAD reviewed:** `ae528d9b`

---

## C3-VER-1 (HIGH, HIGH) — Per-token brute-force lockout can be bypassed via concurrent requests

**File:** `src/lib/assignments/recruiting-invitations.ts:34-55`

**Evidence-based verification:**

The `incrementFailedRedeemAttempt` function executes:
1. `db.select({id, metadata}).from(recruitingInvitations).where(eq(tokenHash, hashToken(token)))` — reads current metadata
2. Computes `currentAttempts + 1` in JavaScript
3. `db.update(recruitingInvitations).set({metadata: {...existing.metadata, [KEY]: String(currentAttempts + 1)}})` — writes back

Between step 1 and step 3, another concurrent call can read the same `existing.metadata` and compute the same increment. The write in step 3 overwrites the other's increment. This is a textbook read-modify-write race.

**Verification approach:** The PostgreSQL `UPDATE ... SET metadata = jsonb_set(metadata, '{_failedRedeemAttempts}', ...)` form is atomic because PostgreSQL acquires a row-level lock during the UPDATE. The current JS-side read-modify-write does NOT acquire any lock because it uses two separate queries (SELECT then UPDATE without `FOR UPDATE`).

**Confirmed:** The brute-force lockout is bypassable under concurrency.

---

## C3-VER-2 (MEDIUM, HIGH) — Initial redeem path missing brute-force counter increment

**File:** `src/lib/assignments/recruiting-invitations.ts:512-519`

**Trace:**
- Line 512: `if (!accountPassword)` — checked and returns `accountPasswordRequired`
- Line 517: `const passwordValidationError = getPasswordValidationError(accountPassword)` — checked
- Line 519: `return { ok: false as const, error: passwordValidationError }` — returns WITHOUT calling `incrementFailedRedeemAttempt`

Compare with re-entry path (line 446-452): `verifyAndRehashPassword` failure calls `void incrementFailedRedeemAttempt(token)`.

**Confirmed:** The initial redeem path does not increment the counter on password validation failure.

---

## C3-VER-3 (LOW, HIGH) — Privacy page `mailto:` link missing `rel="nofollow"`

**File:** `src/app/(public)/privacy/page.tsx:78`

**Verification:** The anchor tag renders `<a className="underline" href="mailto:privacy@xylolabs.com">`. No `rel` attribute. The cycle 2 fix (commit `42df4c66`) added `rel="nofollow"` to the recruiter contact email in `results/page.tsx:285`, but the privacy page was not updated.

**Confirmed:** Missing `rel="nofollow"` on privacy page mailto link.

---

## C3-VER-4 (LOW, MEDIUM) — Export `ALWAYS_REDACT` excludes `judgeWorkers.secretTokenHash`

**File:** `src/lib/db/export.ts:256-262`

**Verification:** `SANITIZED_COLUMNS` includes `judgeWorkers: new Set(["secretTokenHash", "judgeClaimToken"])` (line 252). `ALWAYS_REDACT` does NOT include `judgeWorkers` at all (line 256-262). This means full-fidelity backups contain plaintext worker secrets.

This appears intentional for disaster recovery, but should be documented.
