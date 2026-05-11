# Documentation/Code Mismatch Review: JudgeKit

**Reviewer:** document-specialist
**Date:** 2026-05-11
**Scope:** Doc/code mismatches, stale documentation — Cycle 2 of RPF loop

---

## New Findings Summary

| Severity | Count |
|----------|-------|
| LOW      | 1     |
| **Total**| **1** |

---

## LOW

### DOC1: `db-time.ts` Overly Broad Docstring Not Honored by `execute.ts`
- **File:** `src/lib/db-time.ts:45` (doc comment)
- **Confidence:** High
- **Description:** The module docstring claims to be the replacement for all server-side `Date.now()` calls, but `src/lib/compiler/execute.ts` uses raw `Date.now()` for container age checks. The documentation creates a false expectation of uniform usage.
- **Fix:** Narrow the docstring to "Use this for DB timestamp comparisons in transactional code" and add a comment in `execute.ts` explaining why raw `Date.now()` is appropriate for container lifecycle (not DB-related).

---

## Verification Results

| Document | Checked Against | Status |
|----------|----------------|--------|
| README.md | package.json, tsconfig.json | OK |
| docs/languages.md | src/lib/judge/languages.ts | OK (125 languages) |
| docs/deployment.md | deploy-docker.sh | OK |
| docs/authentication.md | src/lib/auth/ | OK |
| SECURITY.md | src/lib/security/ | OK |
