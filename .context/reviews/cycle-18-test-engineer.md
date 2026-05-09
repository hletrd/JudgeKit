# Cycle 18 Test Engineer Findings (Updated)

**Date:** 2026-05-09
**Reviewer:** Test coverage gaps, flaky tests, TDD opportunities
**Base commit:** 75d82a17
**Previous review:** cycle-18-test-engineer.md (2026-04-19, commit 7c1b65cc)

---

## Previous Finding Status

| ID | Previous Finding | Status |
|----|-----------------|--------|
| F1 | No test for recruiting context caching | **STILL OPEN** — `withRecruitingContextCache` added but no tests |
| F2 | No test for admin backup `needsRehash` | **STILL OPEN** — unchanged |
| F3 | No test for `cleanupOldEvents` legal hold | **STILL OPEN** — unchanged |

---

## New Findings

### N1: No Tests for `decryptPluginSecret` Plaintext Fallback Path

- **File**: `src/lib/plugins/secrets.ts:54`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The function returns plaintext for non-encrypted values. No test verifies this behavior or the production-safe rejection that should be added.
- **Fix**: Add unit tests for: (1) valid encrypted secret decrypts correctly, (2) non-encrypted value returns as-is (current behavior), (3) after fix, non-encrypted value throws in production.

### N2: No Tests for `resolveStoredPath` Path Traversal Defense

- **File**: `src/lib/files/storage.ts:18-27`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: No tests verify that path traversal attempts are rejected.
- **Fix**: Add unit tests for: `..`, `/`, `\`, null bytes, leading `.`, and valid names.

### N3: No Tests for Docker Build Timeout Cleanup

- **File**: `src/lib/docker/client.ts:239-292`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The build timeout and container cleanup logic has no test coverage.
- **Fix**: Add unit tests using a mock spawn that simulates timeout, verify cleanup is called.

### N4: Missing Component Tests for New Layout Components

- **Evidence**: `git status` shows untracked test files (`tests/component/active-timed-assignment-sidebar-panel.test.tsx`, `app-sidebar.test.tsx`, `conditional-header.test.tsx`) but the corresponding source files do not exist on disk.
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: Either the source files were never created (git index corruption) or the tests were written for planned components that don't exist yet.
- **Fix**: Determine if components should exist. If yes, create them. If no, remove phantom test files from git index.
