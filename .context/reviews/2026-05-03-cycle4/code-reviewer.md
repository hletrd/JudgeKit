# Code Review — Cycle 4

**Date:** 2026-05-03
**HEAD reviewed:** `11d9b33a`
**Focus:** Code quality, logic, SOLID, maintainability

---

## C4-CR-1 (HIGH, HIGH confidence) — `updateRecruitingInvitation` skips `_sys.` namespace validation on metadata

**File:** `src/lib/assignments/recruiting-invitations.ts:258-289`

`createRecruitingInvitation` (line 99) and `bulkCreateRecruitingInvitations` (line 131) both call `findInternalKeyViolation()` to reject metadata keys starting with `_sys.` before persisting. However, `updateRecruitingInvitation` (line 268) writes `data.metadata` directly to the database without this check. The PATCH route at `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:144` passes `body.metadata` through the Zod schema but the schema does not enforce the `_sys.` prefix constraint either.

A caller with `recruiting.manage_invitations` capability can set `_sys.accountPasswordResetRequired: "true"` or `_sys.failedRedeemAttempts: "0"` via the PATCH endpoint, bypassing the brute-force lockout or triggering an unwanted password reset.

**Fix:** Call `findInternalKeyViolation(data.metadata)` in `updateRecruitingInvitation` before line 268, throwing if violated. The `updateRecruitingInvitationSchema` Zod schema could also be extended with a `refine()` check, but the library-level guard is the authoritative boundary.

---

## C4-CR-2 (MEDIUM, HIGH confidence) — `recruiting/validate/route.ts` and `recruiting-token.ts` use inline `createHash` instead of shared `hashToken`

**Files:**
- `src/app/api/v1/recruiting/validate/route.ts:2,21` — `import { createHash } from "crypto"` + `createHash("sha256").update(parsed.data.token).digest("hex")`
- `src/lib/auth/recruiting-token.ts:1,33` — `import { createHash } from "crypto"` + `createHash("sha256").update(token).digest("hex").slice(0, 8)`

Cycle 3 extracted `hashToken` to `src/lib/security/token-hash.ts` specifically to prevent the DRY violation where `recruiting-invitations.ts` and `judge/auth.ts` had duplicate hash functions. However, two other files were missed during the refactor. If the hash algorithm ever changes, these two call sites will silently diverge.

**Fix:** Replace inline `createHash("sha256")...` with `import { hashToken } from "@/lib/security/token-hash"` in both files.

---

## C4-CR-3 (LOW, HIGH confidence) — `recruiting-token.ts:33` token fingerprint truncation is not documented

**File:** `src/lib/auth/recruiting-token.ts:33`

The token fingerprint `createHash("sha256").update(token).digest("hex").slice(0, 8)` truncates the SHA-256 hash to 8 hex characters (32 bits). This is used in login event logs as `recruit:${tokenFingerprint}`. While truncation for log obfuscation is reasonable, the 32-bit fingerprint has a ~1-in-4 billion collision probability — sufficient for audit logging but insufficient for any security-sensitive comparison. No comment documents this boundary.

**Fix:** Add a comment explaining the truncation is for audit-log readability and is NOT suitable for security comparisons.

---

## C4-CR-4 (LOW, MEDIUM confidence) — `recruiting-request-cache.ts` single-user cache limitation

**File:** `src/lib/recruiting/request-cache.ts:28-58`

The `recruitingContextStore` uses a single `AsyncLocalStorage<CachedContext>` where `CachedContext` holds exactly one `userId` and `context`. If a request needs to check recruiting access for multiple users (unlikely today but possible in future admin views), only the last-set context survives. The `setCachedRecruitingContext` function silently overwrites any existing context (line 54-55).

**Fix:** Document this as a single-user-per-request constraint, or refactor to a Map if multi-user access becomes needed.
