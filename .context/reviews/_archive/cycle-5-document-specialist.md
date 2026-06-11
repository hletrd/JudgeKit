# Document Specialist — RPF Cycle 5

**Reviewer:** document-specialist
**Base commit:** 00002346
**Date:** 2026-04-22

## Findings

### DOC-1: `apiFetch` JSDoc example does not cover the `.json()` before `response.ok` anti-pattern in error-first flow [LOW/LOW]

**File:** `src/lib/api/client.ts:25-41`
**Confidence:** HIGH

The JSDoc was updated in cycle 3 to document the `response.ok` before `.json()` pattern, which is good. However, the example only shows the "success-first" pattern (check `!response.ok`, then `response.json()` for success). It does not show the "error-first" pattern used by `discussion-post-delete-button.tsx` and `start-exam-button.tsx` (call `.json()` first, then check `response.ok`), and does not explain why this pattern is also vulnerable.

**Fix:** Add a second example showing the error-first antipattern and why it should be avoided. Specifically document that `const body = await response.json(); if (!response.ok) { throw new Error(body.error); }` is unsafe because `.json()` throws on non-JSON bodies.

---

### DOC-2: `recruiting-invitations-panel.tsx` — `handleRevoke` and `handleDelete` JSDoc missing [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:229-281`
**Confidence:** LOW

These mutation handlers lack any documentation. While not critical, they perform important state changes (revoke invitation, delete invitation) and would benefit from JSDoc explaining the behavior.

**Fix:** Add JSDoc to handler functions.

## Summary

2 findings: 2 LOW/LOW.
