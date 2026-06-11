# RPF Cycle 35 — Test Engineer

**Date:** 2026-04-23
**Base commit:** 218a1a93

## TE-1: No test for recruiting invitation NaN expiryDate bypass [MEDIUM/MEDIUM]

**File:** Tests for `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts`

**Description:** There is no test that verifies the behavior when `expiryDate` contains a non-YYYY-MM-DD format. A date string with a time component (e.g., `"2026-01-01T00:00:00Z"`) produces an Invalid Date, bypassing all validation checks due to NaN comparison semantics. This is a real security bug that should have test coverage.

**Fix:** Add integration/unit tests:
```typescript
test("rejects expiryDate with time component", async () => {
  const res = await POST(request with body.expiryDate = "2026-01-01T00:00:00Z");
  expect(res.status).toBe(400);
});

test("accepts valid YYYY-MM-DD expiryDate", async () => {
  const res = await POST(request with body.expiryDate = "2026-12-31");
  expect(res.status).toBe(201);
});

test("rejects past expiryDate", async () => {
  const res = await POST(request with body.expiryDate = "2020-01-01");
  expect(res.status).toBe(400);
});
```

**Confidence:** HIGH

---

## TE-2: No test for Sunset header on deprecated import JSON path [LOW/MEDIUM]

**File:** Tests for `src/app/api/v1/admin/migrate/import/route.ts`

**Description:** The JSON body path now returns `Deprecation` and `Sunset` headers, but there is no test verifying these headers are present and have valid values. The current bug (past Sunset date) would have been caught by a test checking `new Date(sunsetHeader) > new Date()`.

**Fix:** Add a test:
```typescript
test("JSON body path returns Deprecation and future Sunset headers", async () => {
  const res = await POST(request with JSON body);
  expect(res.headers.get("Deprecation")).toBe("true");
  const sunsetDate = new Date(res.headers.get("Sunset")!);
  expect(sunsetDate.getTime()).toBeGreaterThan(Date.now());
});
```

**Confidence:** MEDIUM

---

## TE-3: No test verifying contest stats query efficiency (no double-scan) [LOW/LOW]

**File:** Tests for `src/app/api/v1/contests/[assignmentId]/stats/route.ts`

**Description:** The stats query scans the submissions table twice (in `user_best` and `solved_problems` CTEs). While this is a performance issue rather than a correctness bug, there's no test that verifies the query structure or that the stats are computed correctly under various edge cases (no submissions, all accepted, all wrong).

**Fix:** Add functional tests for the stats endpoint covering edge cases.

**Confidence:** LOW
