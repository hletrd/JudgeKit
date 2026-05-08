# Test Engineer Review — Cycle 2 (2026-05-03)

**Reviewer:** test-engineer
**HEAD:** `689cf61d`

---

## C2-TE-1 (MEDIUM, HIGH confidence) — No tests for recruiting token redeem edge cases

**File:** `src/lib/assignments/recruiting-invitations.ts`

The `redeemRecruitingToken` function is one of the most security-critical functions in the codebase (creates users, enrolls, claims invitations atomically). There are no unit tests for it. The function has multiple edge cases:
- Concurrent redemption (atomic SQL check)
- Expired token with pending status
- Already-redeemed token with password reset required
- Revoked token
- Assignment not found or closed
- Password validation failure

**Fix:** Add integration tests for `redeemRecruitingToken` that exercise these edge cases. The transactional nature makes unit testing difficult without a test DB, so consider adding these to the integration test suite.

---

## C2-TE-2 (LOW, HIGH confidence) — No tests for audit event buffer flush failure handling

**File:** `src/lib/audit/events.ts`

The `flushAuditBuffer` function has complex error handling (re-prepending, silent failure after threshold, consecutive failure counting). None of this is tested.

**Fix:** Add unit tests for `flushAuditBuffer` that mock the DB insert to fail and verify:
- Events are re-prepended on failure
- `droppedAuditEvents` counter is not incremented (since events are re-prepended, not dropped)
- `consecutiveAuditFailures` counter increments
- CRITICAL log is emitted after `MAX_SILENT_FAILURES`

---

## C2-TE-3 (LOW, HIGH confidence) — No tests for API key effective role resolution

**File:** `src/lib/api/api-key-auth.ts:114-118`

The effective role resolution logic (`keyRoleRank <= userRoleRank ? candidate.role : user.role`) has subtle behavior when custom roles are involved. No tests exist for this logic.

**Fix:** Add unit tests for the role resolution logic with various combinations of built-in and custom roles.

---

## C2-TE-4 (LOW, MEDIUM confidence) — 2256 unit tests all passing

All 307 test files pass with 2256 tests. No pre-existing test failures found. The test suite is in good shape.

---

## Final Sweep

Test coverage is reasonable for the core business logic but thin on the security-critical auth paths (recruiting token redemption, API key auth, audit buffer). The existing tests for `recruiting-results`, `docker-path-validation`, and `escape-like-pattern` are well-structured.
