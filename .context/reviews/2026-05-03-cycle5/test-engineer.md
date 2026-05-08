# Test Engineer Review — Cycle 5 (2026-05-03)

**HEAD reviewed:** `eb4429a5`

---

## C5-TE-1 (MEDIUM, HIGH confidence) — No test verifying guest viewers cannot see `compileOutput` on public submissions

**Files:** `src/app/(public)/submissions/page.tsx`, `src/components/submission-status-badge.tsx`

The compileOutput exposure finding (C5-SEC-1) has no test guard. After it is fixed, a regression test should verify that guests never see compile output on the public submissions list. Without a test, a future refactor could reintroduce the leak.

**Fix:** Add an integration/component test that renders the submissions list as a guest and asserts `compileOutput` is not present in the rendered output.

---

## C5-TE-2 (MEDIUM, HIGH confidence) — No Zod-schema-level test for `_sys.` namespace rejection

**File:** `src/lib/validators/recruiting-invitations.ts`

Cycle 4 added runtime-level tests for `_sys.` rejection (in `metadata-namespace-validation.test.ts`), but there is no test that the Zod schemas themselves reject `_sys.` keys. If a `.refine()` is added per C5-CR-5, a test should verify it.

**Fix:** Add unit tests for `createRecruitingInvitationSchema` and `updateRecruitingInvitationSchema` verifying that metadata with `_sys.` keys fails validation.

---

## C5-TE-3 (LOW, MEDIUM confidence) — 24 pre-existing test failures

Carry-forward from prior cycles. Not investigated yet.

**Status:** DEFERRED — investigation needed.

---

## C5-TE-4 (LOW, MEDIUM confidence) — No test for `api-key-auth.ts` hash algorithm consistency

**File:** `src/lib/api/api-key-auth.ts:22`

If the inline `createHash("sha256")` is replaced with `hashToken` (per C5-CR-3/C5-SEC-2), a test should verify that existing API key hashes in the DB still verify correctly after the change.

**Fix:** Add a test that creates an API key, stores its hash, and verifies it with the updated function.
