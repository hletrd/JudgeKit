# RPF Cycle 3 — Document Specialist

**Date:** 2026-04-22
**Base commit:** 678f7d7d

## Findings

### DOC-1: `SubmissionListAutoRefresh` comments describe non-functional backoff behavior [MEDIUM/HIGH]

**File:** `src/components/submission-list-auto-refresh.tsx:32-34`
**Confidence:** HIGH

The comment on lines 32-34 states:
```
// Use router.refresh() wrapped in startTransition to detect errors.
// When router.refresh() throws or the page is unreachable, increment
// error count for exponential backoff. Reset on success.
```

This is factually incorrect. `router.refresh()` does not throw on network errors and does not detect unreachable states. The documented behavior cannot occur with the current implementation. This is not just a documentation issue — it's a code-comment mismatch that could mislead future developers.

**Fix:** Either fix the code to match the comment (replace `router.refresh()` with `fetch()`), or update the comment to accurately describe the current (non-functional) behavior.

---

### DOC-2: `contest-layout.tsx` comment references upstream Next.js bug but provides no issue number [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/contests/layout.tsx:14-18`
**Confidence:** LOW

The TODO comment says "Track: https://github.com/vercel/next.js/issues (search for RSC streaming corruption with proxy headers). If no issue exists, one should be filed." This is a placeholder, not an actual tracking reference.

**Fix:** Either file the issue and update the comment with the issue number, or remove the speculative text.

---

## Verified Safe

- `clipboard.ts` JSDoc is accurate and matches the implementation
- `use-source-draft.ts` has no code-comment mismatches
- `anti-cheat-monitor.tsx` comments accurately describe the event persistence and retry logic
