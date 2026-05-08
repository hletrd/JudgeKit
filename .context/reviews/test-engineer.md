# Test Engineer Review — Cycle 12/100

**Reviewer:** test-engineer (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** e584aeac
**Scope:** Test coverage gaps, flaky tests, TDD opportunities

---

## NEW FINDINGS

### C12-TE-1 — Missing test for judge deregister route malformed JSON handling
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/judge/deregister/route.ts`
- **Problem:** The deregister route lacks a test for malformed JSON request bodies. Cycle 10 added tests for register, claim, heartbeat, and poll routes, but deregister was missed. This creates a coverage gap for the same vulnerability class.
- **Fix:** Add a test case that sends a truncated/non-JSON body to `/api/v1/judge/deregister` and asserts HTTP 400 with error code `invalidJson`.

---

## No Other Test Issues Found

Existing component tests for countdown-timer do not cover the staggered toast path (which requires simulating visibilitychange after backgrounding). The SSE events route tests cover timeout and abort scenarios. Judge route tests from cycle 10 cover the fixed routes. No flaky tests detected in the current test suite.
