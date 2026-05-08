# Code Review — Cycle 3 (2026-05-03)

**HEAD reviewed:** `ae528d9b`
**Scope:** Full codebase, emphasis on recently changed files and areas not deeply reviewed in prior cycles.

---

## C3-CR-1 (MEDIUM, HIGH) — `incrementFailedRedeemAttempt` races with itself under concurrent failed redeems

**File:** `src/lib/assignments/recruiting-invitations.ts:34-55`

`incrementFailedRedeemAttempt` reads `metadata`, modifies it in JS, and writes it back with `db.update()`. Two concurrent failed redeems for the same token will both read the same metadata, increment to the same value, and write it back — losing one increment. The counter is meant to cap brute-force at 5 attempts, but a concurrent attacker only needs ~3 sequential attempts to accumulate 5 lost increments.

**Fix:** Use an atomic SQL update: `SET metadata = jsonb_set(metadata, '{_failedRedeemAttempts}', (COALESCE((metadata->>'_failedRedeemAttempts')::int, 0) + 1)::text)`. Or use `SELECT ... FOR UPDATE` inside a transaction.

---

## C3-CR-2 (MEDIUM, HIGH) — `redeemRecruitingToken` does not increment `incrementFailedRedeemAttempt` for wrong-password on initial redeem

**File:** `src/lib/assignments/recruiting-invitations.ts:512`

When a candidate provides a wrong `accountPassword` during the *initial* redeem path (line 512 — `!accountPassword` returns `accountPasswordRequired`, not a failed password), there is no increment. But more critically, when the password validation fails in the *re-entry* path (line 446-452), `incrementFailedRedeemAttempt` is called with `void` (fire-and-forget). The `void` prefix means the call happens outside the transaction, but the increment itself is not atomic (see C3-CR-1). If the token was obtained by an attacker, they get 5 full attempts *per concurrent request* because the race on the counter allows them to all read the same count.

**Fix:** Combine with C3-CR-1 fix — make the counter update atomic at the SQL level so concurrent attempts are properly serialized.

---

## C3-CR-3 (LOW, HIGH) — `updateRecruitingInvitation` allows `updatedAt` to drift from `withUpdatedAt()` pattern

**File:** `src/lib/assignments/recruiting-invitations.ts:238`

`updateRecruitingInvitation` manually sets `updatedAt: await getDbNowUncached()`. Other update paths use `withUpdatedAt()` or forget entirely. This is a carry-forward from C2-F9 but the manual approach in this specific function is actually correct — it uses DB server time. The inconsistency is a maintainability risk.

**Fix:** Extract a shared `withUpdatedAt` helper that uses `getDbNowUncached()` and use it consistently.

---

## C3-CR-4 (LOW, MEDIUM) — `hashToken` function duplicated between `recruiting-invitations.ts` and `judge/auth.ts`

**Files:**
- `src/lib/assignments/recruiting-invitations.ts:65`
- `src/lib/judge/auth.ts:21`

Both define `hashToken(token: string)` using `createHash("sha256").update(token).digest("hex")`. This is not a bug but a DRY violation — if the hash algorithm changes, one copy may be missed.

**Fix:** Export `hashToken` from a shared module (e.g., `src/lib/security/token-hash.ts`) and import in both consumers.

---

## C3-CR-5 (LOW, HIGH) — `redeemRecruitingToken` initial redeem does not increment failed counter for bad passwords

**File:** `src/lib/assignments/recruiting-invitations.ts:512-519`

When `accountPassword` is provided but fails `getPasswordValidationError`, the function returns `{ ok: false, error: passwordValidationError }` without incrementing `incrementFailedRedeemAttempt`. This means an attacker who knows a valid token but doesn't know the password format rules can try unlimited weak passwords until they find one that passes validation, then use it.

**Fix:** Add `void incrementFailedRedeemAttempt(token)` before returning the validation error, same as the wrong-password path at line 450.

---

## C3-CR-6 (LOW, MEDIUM) — Privacy page `mailto:` link lacks `rel="nofollow"`

**File:** `src/app/(public)/privacy/page.tsx:78`

The privacy contact email is rendered as `<a href="mailto:privacy@xylolabs.com">` without `rel="nofollow"`. The recruiter email link was fixed in cycle 2 (commit `42df4c66`), but this public-facing email link was missed.

**Fix:** Add `rel="nofollow"` to the mailto link, consistent with the recruiter contact email fix.

---

## C3-CR-7 (LOW, MEDIUM) — `json-ld.tsx` uses `dangerouslySetInnerHTML` without explicit sanitization context

**File:** `src/components/seo/json-ld.tsx:21`

The `safeJsonForScript` function is used but its implementation should be verified to prevent JSON injection in script tags. This is a low-risk finding since JSON-LD is typically admin-controlled data, but the pattern should be validated.

**Fix:** Verify `safeJsonForScript` properly escapes `</script` sequences within JSON string values.
