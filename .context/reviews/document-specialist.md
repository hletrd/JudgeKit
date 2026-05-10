# Document Specialist Review — Cycle 33

**Reviewer:** document-specialist
**Date:** 2026-05-10
**Scope:** Documentation/code mismatches, comment accuracy

---

## Findings

### C33-DS-1: [LOW] apiFetchJson docs claim safety but miss fetch() errors

**File:** `src/lib/api/client.ts:64-72`
**Confidence:** HIGH

The doc comment for `apiFetchJson` says: "Fetch a URL with CSRF headers, check `res.ok`, and safely parse the JSON response body in one call. This eliminates the common footguns of: ..."

But footgun #1 in the docs is "Forgetting to check `res.ok` before `.json()`" — the function does handle this. However, it does NOT handle `fetch()` itself throwing, which is a different but equally common footgun.

**Fix:** Update docs to mention that network-level errors (fetch throwing) are NOT caught and must be handled by the caller, OR add the catch.

---

### C33-DS-2: [LOW] contests layout TODO lacks upstream issue link

**File:** `src/app/(public)/contests/manage/layout.tsx:16-18`
**Confidence:** LOW

The TODO says "Remove this workaround once the upstream Next.js bug is fixed" but provides no GitHub issue link or version number to track.

**Fix:** Add a specific Next.js issue URL or version threshold for removal.

---

## Positive Observations

1. api/client.ts has excellent inline documentation with examples.
2. Anti-cheat storage module has thorough rationale comments.
3. sanitize-html.ts documents the security rationale for each restriction.
