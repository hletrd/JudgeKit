# Test Coverage Review: JudgeKit

**Reviewer:** test-engineer
**Date:** 2026-05-10
**Scope:** Test coverage gaps, flaky tests, missing test scenarios

---

## Summary

The project has extensive test coverage (454 test files) but several critical areas lack dedicated unit tests, particularly around scoring logic, state management hooks, and error handling. Integration tests cover many paths but unit tests for pure logic functions are sparse.

---

## HIGH Severity

### 1. No Unit Tests for Scoring Logic
**File:** `src/lib/judge/verdict.ts`
**Severity:** HIGH
**Confidence:** High

The scoring computation (`computeFinalJudgeMetrics`, `extractFinalJudgeDetail`, `buildSubmissionResultRows`) has zero dedicated unit tests. These functions determine contest rankings and student grades. Bugs here directly affect fairness.

**Test gaps:**
- Score with 0 results (null score)
- Score with all accepted (100.00)
- Score with partial acceptance (e.g., 2/3 = 66.67)
- Score with large result counts
- `extractFinalJudgeDetail` with no failures, first failure, runtime_error
- `buildSubmissionResultRows` with null/undefined fields

**Fix:** Add `tests/unit/judge/verdict.test.ts` with comprehensive parameterized tests.

---

## MEDIUM Severity

### 2. No Unit Tests for useSourceDraft Hook
**File:** `src/hooks/use-source-draft.ts`
**Severity:** MEDIUM
**Confidence:** High

This is one of the most complex hooks in the codebase (430+ lines) with custom store, synchronization, TTL, hydration, and persistence. It has no unit tests.

**Test gaps:**
- Draft persistence across language switches
- TTL expiration (7 days)
- Hydration from localStorage
- Race conditions between setSourceCode and persist
- clearDraft / clearAllDrafts behavior
- isDirty tracking

**Fix:** Add `tests/unit/hooks/use-source-draft.test.ts`. Mock localStorage and test state transitions.

### 3. No Tests for Audit Event Buffer Flush
**File:** `src/lib/audit/events.ts`
**Severity:** MEDIUM
**Confidence:** High

The audit buffering system (batching, flush timer, failure recovery, overflow dropping) has no unit tests. This is critical for security compliance.

**Test gaps:**
- Events are batched until threshold
- Flush timer triggers periodic writes
- Failed flush re-buffers events
- Overflow drops events correctly
- Graceful shutdown flushes remaining events

**Fix:** Add `tests/unit/audit/events.test.ts`. Mock DB insert and test flush behavior.

### 4. No Tests for Error Boundaries
**File:** `src/app/(dashboard)/error.tsx`, `src/app/(public)/error.tsx`, `src/app/(auth)/error.tsx`
**Severity:** MEDIUM
**Confidence:** High

Error boundary components have no tests. These are the last line of defense for UI crashes.

**Test gaps:**
- Error boundary catches and renders
- Reset button works
- Navigation links work
- Korean locale translations load correctly

**Fix:** Add component tests for error boundaries using React Testing Library.

### 5. No Tests for Cursor Pagination Edge Cases
**File:** `src/app/api/v1/submissions/route.ts:51-101`
**Severity:** MEDIUM
**Confidence:** Medium

Cursor pagination is tested implicitly through integration tests but edge cases lack coverage:

**Test gaps:**
- Invalid cursor ID (non-existent submission)
- Cursor with no submittedAt (corrupted data)
- Cursor pointing to a submission the user cannot access
- Empty result set with cursor

**Fix:** Add API-level tests for cursor pagination edge cases.

### 6. Missing Tests for Compiler Container Cleanup
**File:** `src/lib/compiler/execute.ts:800-894`
**Severity:** MEDIUM
**Confidence:** Medium

The `cleanupOrphanedContainers` function has no tests. It parses `docker ps --format '{{json .}}'` output and makes cleanup decisions.

**Test gaps:**
- Container with "exited" status is cleaned
- Running container older than 10 minutes is cleaned
- Running container younger than 10 minutes is preserved
- Unparseable JSON line is skipped gracefully
- Inspect fallback when CreatedAt is missing

**Fix:** Extract the parsing logic into a pure function and unit test it with mock docker output.

---

## LOW Severity

### 7. No Tests for CSRF Edge Cases
**File:** `src/lib/security/csrf.ts`
**Severity:** LOW
**Confidence:** Medium

**Test gaps:**
- Request with no Origin and no sec-fetch-site (older browser)
- Request with data: URL origin
- Request with malformed Origin header
- Safe method (GET) bypass

**Fix:** Add unit tests for `validateCsrf` with various header combinations.

### 8. No Tests for File Extension Extraction
**File:** `src/app/api/v1/files/[id]/route.ts`
**Severity:** LOW
**Confidence:** Low

Edge cases like `.gitignore`, `archive.tar.gz`, and names without dots are not tested.

**Fix:** Extract extension logic to a pure function and add unit tests.

---

## Final Sweep

Coverage areas examined:
- Pure logic functions: `src/lib/judge/verdict.ts` (missing)
- React hooks: `src/hooks/use-source-draft.ts` (missing)
- Audit system: `src/lib/audit/events.ts` (missing)
- Error boundaries: `src/app/**/error.tsx` (missing)
- Pagination: `src/app/api/v1/submissions/route.ts` (partial)
- Docker cleanup: `src/lib/compiler/execute.ts` (missing)
- CSRF: `src/lib/security/csrf.ts` (partial)

The project has 454 test files but many are integration/implementation tests. Core business logic (scoring, judging) needs more focused unit tests.
