# Test Engineer Review — RPF Cycle 38

**Date:** 2026-04-23
**Reviewer:** test-engineer
**Base commit:** 4dd3d951

## Inventory of Files Reviewed

- Test files under `src/__tests__/` and `__tests__/`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/` — Routes under test
- `src/app/api/v1/contests/quick-create/route.ts` — Route under test
- `src/app/api/v1/admin/api-keys/` — Routes under test

## Findings

### TE-1: No test coverage for bulk invitation case-insensitive email dedup [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts`

**Description:** The bulk invitation route's email deduplication logic (lines 40-53) has no test verifying case-insensitive behavior. The single-create route uses `lower()` but the bulk route uses `inArray()` — this inconsistency was not caught by tests because no test exercises the case-insensitive dedup scenario for the bulk route.

**Concrete failure scenario:** A test creates a single invitation with email "Alice@Example.COM", then creates a bulk invitation with email "alice@example.com". The test expects a 409 conflict but gets 201 because the bulk route's `inArray` does a case-sensitive match. This test would have caught the bug before it shipped.

**Fix:** Add a test case:
```typescript
it("rejects bulk invitation with duplicate email (case-insensitive)", async () => {
  // Create single invitation with mixed-case email
  await createInvitation({ candidateEmail: "Alice@Example.COM" });
  // Attempt bulk create with lowercased email
  const res = await POST({ invitations: [{ candidateEmail: "alice@example.com" }] });
  expect(res.status).toBe(409);
});
```

**Confidence:** High

---

### TE-2: No test for quick-create route NaN guard behavior [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/quick-create/route.ts:36-43`

**Description:** The NaN guards added in cycle 37 have no dedicated test. While the Zod `.datetime()` schema prevents invalid date strings at the validation layer, the defense-in-depth NaN guards are untested. If the schema is ever relaxed, the NaN guards are the last line of defense but have no test evidence.

**Fix:** Add a unit test that bypasses Zod validation (or uses an integration test) to verify that `Invalid Date` values are rejected with the appropriate error codes.

**Confidence:** Medium

---

## Previously Deferred Items (Still Present)

- Anti-cheat copies user text content (deferred)
