# Architect Review — Cycle 5 (2026-05-03)

**HEAD reviewed:** `eb4429a5`

---

## C5-ARCH-1 (MEDIUM, HIGH confidence) — Submissions list page bypasses the centralized visibility model

**Files:** `src/app/(public)/submissions/page.tsx` vs `src/lib/submissions/visibility.ts`

The `sanitizeSubmissionForViewer` function in `visibility.ts` is the centralized authority for what submission fields a viewer can see. The public submissions list page does not use it — it constructs its own query and renders fields directly. This creates a maintenance hazard: new sensitive fields added to the schema will automatically appear in the list page query unless explicitly excluded.

The detail page (`src/app/(public)/submissions/[id]/page.tsx`) does not use `sanitizeSubmissionForViewer` either — it has its own inline `isOwner` checks. Both pages independently implement visibility logic, and the two implementations diverge (the detail page nulls `compileOutput` for non-owners; the list page does not).

**Fix:** Either (a) have both pages use `sanitizeSubmissionForViewer`, or (b) define a "safe for public list" column projection constant and use it in the list page query.

---

## C5-ARCH-2 (LOW, MEDIUM confidence) — 59 API routes (218 total - 159 via createApiHandler) lack unified error handling and rate limiting

218 total API route handlers; only 159 use `createApiHandler`. The remaining 59 may have inconsistent error handling, missing rate limiting, or missing audit logging. This is a carry-forward from prior cycles (ARCH-CARRY-1).

**Status:** DEFERRED — API handler unification cycle needed.

---

## C5-ARCH-3 (LOW, LOW confidence) — Two rate-limit modules with different semantics share a table

Known documented divergence (C4-ARCH-2 / C7-AGG-9). No action needed this cycle.
