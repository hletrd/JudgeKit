# Test Engineer Review — Cycle 1 (2026-05-03)

**Reviewer:** test-engineer
**Scope:** Test coverage gaps, flaky tests, TDD opportunities
**HEAD:** 689cf61d

---

## Findings

### C1-TE-1: No unit tests for `docker/client.ts` build path validation
**File:** `src/lib/docker/client.ts:159-169, 349-354`
**Severity:** LOW | **Confidence:** HIGH

The `buildDockerImageLocal()` and `buildDockerImage()` path validation logic (prefix check + traversal check) has no dedicated unit tests. The inconsistency between local (`judge-` prefix) and remote (`.` prefix) validation was caught by code review but should have been caught by tests.

**Fix:** Add unit tests for `isValidImageReference()` and the dockerfile path validation logic (both local and remote paths).

### C1-TE-2: No tests for `recruiting-invitations.ts` column-level encryption (once implemented)
**File:** `src/lib/assignments/recruiting-invitations.ts`
**Severity:** LOW | **Confidence:** MEDIUM

Once `candidateName` and `candidateEmail` are encrypted at rest (C1-CR-3 / C1-SEC-2), tests should verify that the DB never stores plaintext PII and that `decrypt()` correctly handles both encrypted and legacy plaintext values during migration.

**Fix:** Add integration tests for the recruiting invitation flow that verify encryption at rest.

### C1-TE-3: No tests for magic-byte validation (once implemented)
**File:** `src/app/api/v1/files/route.ts`
**Severity:** LOW | **Confidence:** MEDIUM

Once magic-byte verification is added (C1-CR-4 / C1-SEC-3), tests should verify that files with mismatched content-type and actual content are rejected.

**Fix:** Add tests for the file upload endpoint with mismatched MIME types.

---

## Test Infrastructure Observations

- The codebase has a solid test infrastructure: `vitest` for unit/component, `playwright` for E2E, and a dedicated `test/seed` endpoint for E2E data setup.
- The seed endpoint is well-secured: timing-safe token comparison, localhost-only, gated by `PLAYWRIGHT_AUTH_TOKEN` env var, and `e2e-` prefix convention for cleanup scoping.
- Component tests cover 50+ components — good breadth for a project this size.
