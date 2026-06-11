# Architectural Review — Cycle 12 (HEAD: ecfa0b6c)

**Date:** 2026-05-11
**Reviewer:** architect
**Scope:** Design risks, coupling, layering, consistency

---

## Findings

### C12-ARCH-1: Inconsistent cleanup contract in apiFetch branches
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/lib/api/client.ts:90-98`

The `apiFetch` function has two branches with different cleanup contracts:
- Branch A (lines 90-94): Uses `withTimeout` + `cleanupWithTimeout` in `.finally()`
- Branch B (lines 97-98): Uses `createTimeoutSignal` with NO cleanup

This inconsistency means callers cannot reason uniformly about resource cleanup. The abstraction leaks implementation details — callers must know whether they passed a signal to know if cleanup happens.

**Fix:** Unify both branches to use the same cleanup pattern. Extract a helper that always creates a managed signal and always cleans it up.

---

### C12-ARCH-2: normalizeSubmission mixes data transformation with validation
**Severity:** LOW | **Confidence:** Medium
**File:** `src/hooks/use-submission-polling.ts:45-119`

`normalizeSubmission` both transforms API responses to the `SubmissionDetailView` type AND validates field types inline. This dual responsibility makes the function harder to maintain and test. A schema validation library (Zod) would separate concerns and provide better error messages.

**Fix:** Consider extracting a Zod schema for `SubmissionDetailView` and using it for validation, then transforming. This would eliminate all `as` casts and provide runtime type safety.

---

## Verified

- Layer boundaries remain clean (no new cross-layer coupling).
- No new circular dependencies detected.
