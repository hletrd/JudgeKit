# Document Specialist — Cycle 16 Review

**Date:** 2026-05-09
**HEAD:** 64de91dd
**Scope:** Doc/code mismatches against authoritative sources

## Summary

One documentation/code mismatch identified. The extensive comment block in api/client.ts continues to promise safety that the code does not deliver.

## Findings

### DS-1: apiFetch documentation promises timeout safety but code only partially delivers [MEDIUM]

- **File:** `src/lib/api/client.ts:74-90`
- **Confidence:** High
- **Severity:** Medium
- **Doc Claim:** After the C15 fix, the wrapper now includes timeout protection.
- **Actual Code:** Timeout is only applied when `init?.signal` is undefined. When callers pass their own signal, no timeout is applied.
- **Mismatch:** The documentation does not mention this limitation. Developers reading the code would reasonably assume that apiFetch always provides a 30s timeout.
- **Fix:** Update the doc comment to clarify:
  1. apiFetch applies a 30s default timeout when NO signal is provided
  2. When a signal IS provided, the caller is responsible for their own timeout
  3. OR (preferred): Fix the code to always apply a timeout and update docs to match

### DS-2: Test comment documents buggy behavior as correct [LOW]

- **File:** `tests/unit/api/client.test.ts:81`
- **Confidence:** High
- **Severity:** Low
- **Problem:** Test name "preserves caller-provided signal instead of default timeout" documents the bypass behavior as intentional.
- **Fix:** Update test name and assertions to reflect the corrected behavior.

## Verified Documentation Accuracy

| Topic | Status |
|---|---|
| AGENTS.md language table | Accurate |
| CLAUDE.md deployment rules | Current and accurate |
| API route auth documentation | Accurate |
| Docker build instructions | Accurate |
| Environment variable docs | Accurate |

## Final Sweep

No stale TODO comments, no outdated instructions, no mismatched type signatures found.
