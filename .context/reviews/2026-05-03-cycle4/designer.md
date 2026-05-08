# Designer Review — Cycle 4

**Date:** 2026-05-03
**HEAD reviewed:** `11d9b33a`
**Focus:** UI/UX review (web frontend with TSX/CSS components)

---

## C4-UX-1 (MEDIUM, HIGH confidence) — Recruiting start page `mailto:` link missing `rel="nofollow"`

**File:** `src/app/(auth)/recruit/[token]/page.tsx:231`

Same class as C2-F18 and C3-F5 (fixed in prior cycles for other pages). The recruit start page's contact email `mailto:` link is missing `rel="nofollow"`. While this is primarily a SEO/spam-protection issue, it's also a UX consistency problem — the same email links on the results page and privacy page DO have `rel="nofollow"`, creating an inconsistent pattern across the product.

---

## C4-UX-2 (LOW, MEDIUM confidence) — Public submissions feed shows `compileOutput` to guests

**File:** `src/app/(public)/submissions/page.tsx:196-212`

The public submission feed (guest viewable) selects `compileOutput` from submissions. While `sanitizeSubmissionForViewer` would strip source code for non-owners, the public list page does not go through that sanitizer — it directly queries and renders `compileOutput` via `SubmissionStatusBadge`. Compiler errors may contain fragments of the user's source code (e.g., line references, variable names in error messages), which could leak more information than intended for guest viewers.

**Fix:** Verify that `SubmissionStatusBadge` does not render `compileOutput` content for guest viewers, or strip `compileOutput` from the query for guest contexts.
