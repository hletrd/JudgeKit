# Document Specialist Review — Cycle 5 (2026-05-03)

**HEAD reviewed:** `eb4429a5`

---

## C5-DOC-1 (MEDIUM, MEDIUM confidence) — Visibility model not documented for list vs detail page divergence

**Files:** `src/lib/submissions/visibility.ts` (has JSDoc), `src/app/(public)/submissions/page.tsx` (no JSDoc)

The `sanitizeSubmissionForViewer` function is well-documented, but neither the list page nor the detail page documents WHY they don't use it. The list page's lack of sanitization is a bug (not just a documentation issue), but the absence of any visibility model documentation on the list page made the bug harder to spot during review.

**Fix:** After fixing the compileOutput leak, add a comment on the list page's query noting that guest-visible fields must be explicitly listed and that `sanitizeSubmissionForViewer` should be consulted when adding new fields.

---

## C5-DOC-2 (LOW, LOW confidence) — `api-key-auth.ts` inline hash not documented as intentional divergence

The file uses `createHash("sha256")` inline without documenting whether this is intentional (different security domain from token hashing) or an oversight. A brief comment would clarify.

---

## All prior cycle documentation improvements verified as present at HEAD
