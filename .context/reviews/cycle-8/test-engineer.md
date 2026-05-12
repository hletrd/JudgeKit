# Test Engineering Review — Cycle 8/100

**Date:** 2026-05-11
**HEAD:** main / 05752cdb
**Reviewer:** test-engineer

---

## Findings

### T1 — LOW — No unit tests for `stopSharedPollTimer` race condition

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:161-166`
- **Description:** `stopSharedPollTimer` is exported and wired into the shutdown handler, but there are no tests verifying that it correctly stops the timer or handles the race with in-flight `sharedPollTick` promises.
- **Confidence:** MEDIUM
- **Suggested fix:** Add unit tests that verify: (1) calling `stopSharedPollTimer` clears the interval, (2) the timer does not restart after stopping, (3) in-flight promises are handled gracefully.

### T2 — LOW — Compiler local fallback path remains uncovered

- **File:** `src/lib/compiler/execute.ts`
- **Description:** The `runDocker` function and local fallback path in `executeCompilerRun` are not covered by unit tests. The Rust runner path is tested indirectly via integration tests, but the Docker container spawn, timeout, OOM detection, and cleanup paths are not.
- **Confidence:** HIGH
- **Suggested fix:** Add unit tests for `runDocker` with mocked `spawn` to verify timeout handling, cleanup, stdout/stderr limits, and error paths.

### T3 — LOW — `pre-restore-snapshot.ts` error paths not fully tested

- **File:** `src/lib/db/pre-restore-snapshot.ts`
- **Description:** The `takePreRestoreSnapshot` function has error handling for `mkdir` failure, `chmod` failure, pipeline failure, and `unlink` cleanup, but these paths are not covered by unit tests.
- **Confidence:** MEDIUM

---

## Test Results

- **vitest:** 317 files, 2399 tests passed
- **eslint:** 0 errors, 0 warnings
- **next build:** success (exit code 0)

All configured gates are green.
