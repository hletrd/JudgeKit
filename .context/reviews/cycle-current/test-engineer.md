# Test Engineer Review — Cycle 1/100

**Date:** 2026-05-08
**HEAD:** main / 5cec65e8
**Reviewer:** test-engineer (consolidated single-pass)

---

## Findings

### T1 — MEDIUM — No tests for `proxy.ts` middleware auth caching logic

- **File:** `src/proxy.ts`
- **Description:** The auth cache (FIFO eviction, TTL handling, multi-key cleanup) is complex but has no dedicated unit tests. The middleware is critical for auth and security headers.
- **Confidence:** HIGH
- **Suggested fix:** Add unit tests for `getCachedAuthUser`, `setCachedAuthUser`, and the cache eviction logic.

### T2 — MEDIUM — `cleanupOrphanedContainers` has no unit tests

- **File:** `src/lib/compiler/execute.ts:773-857`
- **Description:** The container cleanup logic parses Docker CLI output and makes cleanup decisions. This is error-prone and should have tests with mocked `docker ps` output.
- **Confidence:** HIGH
- **Suggested fix:** Add unit tests with mocked `execFile` responses covering: exited containers, stale running containers, parse failures, and removal failures.

### T3 — MEDIUM — No tests for rate-limit eviction timer lifecycle

- **File:** `src/lib/security/rate-limit.ts:69-87`
- **Description:** `startRateLimitEviction` and `stopRateLimitEviction` manage a module-level timer. There are no tests verifying the timer starts correctly, the interval is correct, or cleanup happens on process exit.
- **Confidence:** HIGH
- **Suggested fix:** Add tests that verify timer behavior and that eviction SQL is generated correctly.

### T4 — LOW — `buildDockerImageLocal` success/failure paths not fully tested

- **File:** `src/lib/docker/client.ts:203-277`
- **Description:** The Docker build logic with head+tail buffering is complex but likely only covered by integration tests. Unit tests with mocked spawn events would improve reliability.
- **Confidence:** MEDIUM
- **Suggested fix:** Mock `spawn` events to test: success with truncation, timeout, spawn error, and close with non-zero exit code.

### T5 — LOW — File upload magic-byte verification lacks negative test cases

- **File:** `src/lib/files/validation.ts:167-201`
- **Description:** The `verifyFileMagicBytes` function has logic for images, text types, and known signatures, but there may not be tests for disguised executable uploads or malformed magic bytes.
- **Confidence:** MEDIUM
- **Suggested fix:** Add tests for: executable renamed as PDF, null bytes in text file, unknown MIME type, and truncated buffer.

### T6 — LOW — Anti-cheat heartbeat freshness check not tested

- **File:** `src/lib/assignments/submissions.ts:298-317`
- **Description:** The anti-cheat validation that requires a recent heartbeat event before submission is a critical security check. There should be explicit tests for: fresh heartbeat (pass), stale heartbeat (reject), no heartbeat (reject), and disabled anti-cheat (pass).
- **Confidence:** HIGH
- **Suggested fix:** Add unit tests for `validateAssignmentSubmission` with mock anti-cheat event timestamps.

---

## Test Coverage Verdict

The project has extensive test suites (2322 tests passing). Main gaps are in middleware auth caching, Docker CLI parsing, and security-critical paths like anti-cheat validation.
