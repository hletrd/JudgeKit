# Tracer Review — Cycle 4

**Date:** 2026-05-03
**HEAD reviewed:** `11d9b33a`
**Focus:** Causal tracing of suspicious flows, competing hypotheses

---

## C4-TR-1 (HIGH, HIGH confidence) — Metadata injection flow trace

**Trace:**
1. Caller sends `PATCH /api/v1/contests/{id}/recruiting-invitations/{invId}` with body `{ metadata: { "_sys.failedRedeemAttempts": "0" } }`
2. `createApiHandler` validates auth + capability `recruiting.manage_invitations`
3. `updateRecruitingInvitationSchema` validates body — `metadata` is `z.record(z.string(), z.string())`, passes validation
4. Route handler at line 144 calls `updateRecruitingInvitation(invitationId, { metadata: body.metadata })`
5. `updateRecruitingInvitation` at line 268 writes `data.metadata` directly: `updates.metadata = data.metadata`
6. DB row now has `_sys.failedRedeemAttempts = "0"`, resetting the brute-force counter
7. Next call to `redeemRecruitingToken` reads `invitation.metadata._sys.failedRedeemAttempts` at line 419 — sees "0" — lockout bypassed

**Hypothesis 1 (confirmed):** The `_sys.` namespace guard is missing on the update path. This is the most likely cause — code review confirms `findInternalKeyViolation` is called in `create` and `bulkCreate` but NOT in `update`.

**Hypothesis 2 (rejected):** The Zod schema blocks `_sys.` keys. Rejected — `z.record(z.string(), z.string())` accepts any string key.

---

## C4-TR-2 (MEDIUM, HIGH confidence) — Hash divergence trace on algorithm change

**Trace:**
1. `hashToken` in `src/lib/security/token-hash.ts` computes `createHash("sha256").update(token).digest("hex")`
2. `recruiting/validate/route.ts:21` computes same but independently: `createHash("sha256").update(parsed.data.token).digest("hex")`
3. `recruiting-token.ts:33` computes similar but truncates: `createHash("sha256").update(token).digest("hex").slice(0, 8)`
4. If `hashToken` changes to `createHash("sha512")`, files at steps 2-3 still use SHA-256
5. `recruiting/validate` would return `{ valid: false }` for all tokens because the computed hash no longer matches the stored `tokenHash`

**Fix:** All hash operations should use `hashToken` from the shared module.
