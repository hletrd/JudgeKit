# Verifier Review — Cycle 4

**Date:** 2026-05-03
**HEAD reviewed:** `11d9b33a`
**Focus:** Evidence-based correctness check against stated behavior

---

## C4-VER-1 (HIGH, HIGH confidence) — `updateRecruitingInvitation` metadata write bypasses `_sys.` guard

**Evidence:** Traced the data flow from PATCH API → `updateRecruitingInvitation` → DB write at line 268. The Zod schema `updateRecruitingInvitationSchema` (line 16 of validators) accepts `z.record(z.string(), z.string())` for metadata — no refine/refine check on key names. The library function at line 268 writes `data.metadata` directly with no `findInternalKeyViolation` call. Compared against the CREATE path at line 99 which DOES call the guard. The UPDATE path is the only write boundary missing the check.

**Verdict:** CONFIRMED. The `_sys.` namespace invariant is violated on the update path.

---

## C4-VER-2 (MEDIUM, HIGH confidence) — `recruiting/validate/route.ts` does not use shared `hashToken`

**Evidence:** Line 2 imports `createHash` from `"crypto"`. Line 21 computes `createHash("sha256").update(parsed.data.token).digest("hex")`. This produces identical output to `hashToken` (same algorithm, same encoding). But the import path is different from `src/lib/security/token-hash.ts`. If `hashToken` changes, this route diverges.

**Verdict:** CONFIRMED. This is a DRY violation that could cause a hash divergence on algorithm change.

---

## C4-VER-3 (LOW, HIGH confidence) — Recruit start page `mailto:` missing `rel="nofollow"`

**Evidence:** Grepped all `<a` tags with `href=` containing `mailto:` in `src/app/`. Three found:
1. `src/app/(auth)/recruit/[token]/page.tsx:231` — MISSING `rel="nofollow"`
2. `src/app/(auth)/recruit/[token]/results/page.tsx:289` — HAS `rel="nofollow"` (fixed cycle 2)
3. `src/app/(public)/privacy/page.tsx:82` — HAS `rel="nofollow"` (fixed cycle 3)

**Verdict:** CONFIRMED. One `mailto:` link is missing the spam-protection attribute.
