# Security Review — Cycle 5 (2026-05-03)

**HEAD reviewed:** `eb4429a5`

---

## C5-SEC-1 (HIGH, HIGH confidence) — Guest `compileOutput` exposure on public submissions list (same as C5-CR-1, elevated to HIGH for security)

**File:** `src/app/(public)/submissions/page.tsx:202,435,477` + `src/components/submission-status-badge.tsx:71-79`

Compiler errors frequently contain source code fragments (variable declarations, function signatures, #include paths). The public submissions list passes `compileOutput` to `SubmissionStatusBadge` without checking whether the viewer is a guest. The badge's tooltip renders the raw `compileOutput` text. This is an information disclosure vulnerability — guests can see partial source code of other users' submissions.

The per-detail-page correctly nulls `compileOutput` for non-owners (`src/app/(public)/submissions/[id]/page.tsx:154`), but the list page has no equivalent guard.

**Impact:** Information disclosure — partial source code exposure to unauthenticated users.

**Fix:** Null `compileOutput` before passing to the badge when the viewer is a guest.

---

## C5-SEC-2 (MEDIUM, HIGH confidence) — `api-key-auth.ts` inline hash not using shared `hashToken`

**File:** `src/lib/api/api-key-auth.ts:22`

API key hashing uses `createHash("sha256")` inline, same as the recruiting token path that was consolidated in cycle 4. If the hash algorithm ever changes in `token-hash.ts`, API key verification will silently break — stored hashes won't match newly computed ones.

**Fix:** Replace with `import { hashToken } from "@/lib/security/token-hash"`.

---

## C5-SEC-3 (LOW, HIGH confidence) — `_sys.` namespace not enforced at Zod schema level (defense-in-depth)

**File:** `src/lib/validators/recruiting-invitations.ts:6,16`

Both `createRecruitingInvitationSchema` and `updateRecruitingInvitationSchema` accept `metadata: z.record(z.string(), z.string())` without rejecting `_sys.` prefixed keys. The runtime check in `recruiting-invitations.ts` is the sole guard. A Zod `.refine()` would catch violations at the API boundary, producing consistent 400 responses rather than relying on runtime error handling downstream.

**Fix:** Add `.refine()` to both schemas.

---

## C5-SEC-4 (LOW, LOW confidence) — Public submissions feed exposes user names to guests (carry-forward from C4)

**File:** `src/app/(public)/submissions/page.tsx:209-210`

The public feed returns `users.name`. This may conflict with privacy expectations in some educational settings. Appears intentional given the "Student" column. (Deferred — design/policy decision.)

---

## Verified security hardening from prior cycles

- `_sys.` namespace guard on update path: VERIFIED at `recruiting-invitations.ts:269-274`
- Shared `hashToken` module: VERIFIED in `recruiting-token.ts:8,35` and `validate/route.ts:7,21`
- Atomic brute-force counter: VERIFIED at `recruiting-invitations.ts:64-80`
- `mailto:` nofollow on all three pages: VERIFIED
- `sql.raw` documentation: VERIFIED at `recruiting-invitations.ts:70-72`
