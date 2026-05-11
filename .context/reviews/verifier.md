# Evidence-Based Correctness Review: JudgeKit

**Reviewer:** verifier
**Date:** 2026-05-11
**Scope:** Comment-code mismatches, stale docs, spec violations — Cycle 2 of RPF loop

---

## New Findings Summary

| Severity | Count |
|----------|-------|
| LOW      | 2     |
| **Total**| **2** |

---

## LOW

### V1: `db-time.ts` Documentation Claims It Replaces `Date.now()` But `execute.ts` Uses `Date.now()` Directly
- **File:** `src/lib/db-time.ts:45` (doc comment), `src/lib/compiler/execute.ts:870`
- **Confidence:** Medium
- **Description:** `db-time.ts` has a docstring stating "Use this instead of `Date.now()` in any server-side code that compares against DB timestamps." However, `execute.ts` (server-side compiler execution) directly calls `Date.now()` at line 870 for container age calculation against a DB timestamp (`createdAt`). The comment promises a utility but the code does not use it.
- **Failure scenario:** If `db-time.ts` ever applies normalization (e.g., monotonic clock, timezone fixes), `execute.ts` will behave inconsistently with other server-side code. The documented contract is not honored.
- **Fix:** Either import and use `dbTimeNow()` from `db-time.ts` in `execute.ts`, or remove the overly broad claim from the docstring and narrow it to specific use cases.

### V2: `assignment-form-dialog.tsx` Import Review Finding is a False Positive
- **File:** `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:9`
- **Confidence:** High
- **Description:** The code-reviewer review (H2) claims `getApiData` is imported but unused. The actual import is `getApiError`, which IS used at line 278. The review cited an incorrect identifier name, making the finding invalid.
- **Fix:** No code change needed. The review should be corrected in the aggregate.

---

## Verification Sweep Results

- README.md setup instructions: match current package.json scripts
- docs/languages.md: aligned with `src/lib/judge/languages.ts` (125 languages)
- Environment variable docs: no obvious mismatches found in this cycle
- API route documentation: no stale endpoint references detected
