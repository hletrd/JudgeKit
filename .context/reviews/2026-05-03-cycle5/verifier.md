# Verifier Review — Cycle 5 (2026-05-03)

**HEAD reviewed:** `eb4429a5`

---

## C5-VER-1 (CONFIRMED) — Guest compileOutput exposure on public submissions list

Verified by tracing the data flow:
1. `src/app/(public)/submissions/page.tsx:202` — SQL query selects `compileOutput: submissions.compileOutput` for ALL rows regardless of viewer
2. `src/app/(public)/submissions/page.tsx:435` — Passes `compileOutput={sub.compileOutput}` to `SubmissionStatusBadge`
3. `src/components/submission-status-badge.tsx:71-79` — Renders `compileOutput` in tooltip when `status === "compile_error"`
4. No `isGuest` check between steps 2 and 3

Contrast with the detail page:
1. `src/app/(public)/submissions/[id]/page.tsx:154` — `compileOutput: isOwner ? (submission.compileOutput ?? null) : null`
2. Owner check correctly gates the data

**Verdict:** BUG CONFIRMED. The list page does not guard compileOutput for guests.

---

## C5-VER-2 (CONFIRMED) — `api-key-auth.ts:22` uses inline hash not shared module

Verified: `src/lib/api/api-key-auth.ts:22` contains `return createHash("sha256").update(rawKey).digest("hex");` which is functionally identical to `hashToken()` but uses a separate import path. If the algorithm in `token-hash.ts` changes, this call site will not follow.

---

## C5-VER-3 (CONFIRMED) — All prior cycle fixes verified at HEAD

- `_sys.` namespace on update path: `recruiting-invitations.ts:269-274` — CORRECT
- Shared `hashToken` in recruiting paths: `recruiting-token.ts:8,35`, `validate/route.ts:7,21` — CORRECT
- `mailto:` nofollow on all three pages — CORRECT
- `sql.raw` safety comment — CORRECT
- Single-user constraint docs on request-cache — CORRECT
- Atomic brute-force counter — CORRECT
