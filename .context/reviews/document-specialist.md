# Document Specialist Review — RPF Cycle 24

**Date:** 2026-04-22
**Base commit:** dbc0b18f

## DOC-1: `apiFetchJson` JSDoc does not document the parse-once-before-branch convention for remaining double `.json()` instances [LOW/LOW]

**File:** `src/lib/api/client.ts:117-128`

**Description:** The `apiFetchJson` helper was created to eliminate double `.json()` patterns, and the JSDoc at lines 25-62 documents the anti-pattern. However, 3 components still use the old pattern (`handleBulkAddMembers`, `problem-submission-form` handleRun/handleSubmit, `compiler-client`). The documentation does not explicitly note that migration is incomplete.

**Fix:** Add a note in the JSDoc or a code comment tracking remaining migration targets.

---

## Summary

- LOW: 1 (DOC-1)
- Total new findings: 1
