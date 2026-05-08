# Architect Review — Cycle 4

**Date:** 2026-05-03
**HEAD reviewed:** `11d9b33a`
**Focus:** Architectural/design risks, coupling, layering

---

## C4-ARCH-1 (MEDIUM, HIGH confidence) — `_sys.` namespace validation is inconsistent across the recruiting data layer

**File:** `src/lib/assignments/recruiting-invitations.ts`

The `_sys.` namespace guard (introduced cycle 3) is applied at the library level in `createRecruitingInvitation` and `bulkCreateRecruitingInvitations` but NOT in `updateRecruitingInvitation`. This is a layering violation: the invariant "user-supplied metadata must not contain `_sys.` keys" is a data integrity constraint that should be enforced at every write boundary, not just at create. The current design forces each new mutation path to remember to add the check, which is error-prone (as demonstrated by the missing check in `updateRecruitingInvitation`).

**Fix (recommended):** Extract the metadata validation into a shared `validateRecruitingMetadata()` function called from all three write paths. Alternatively, add a DB trigger or CHECK constraint that rejects JSONB keys starting with `_sys.` at the database level, making the invariant tamper-proof regardless of which code path writes the data.

---

## C4-ARCH-2 (LOW, LOW confidence) — Two rate-limit modules share a table but have different semantics

**Files:** `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`

Both modules write to the `rateLimits` table but use different blocking strategies: the login rate limiter uses exponential backoff with `consecutiveBlocks`, while the API rate limiter uses fixed blocking (`consecutiveBlocks` is always 0). The code explicitly notes this divergence (C7-AGG-9). The risk is that a future change to one module could unintentionally affect the other since they share the same table and row-locking patterns.

**Fix:** This is a known, documented divergence. No action needed this cycle beyond ensuring any fix to one module is checked against the other.
