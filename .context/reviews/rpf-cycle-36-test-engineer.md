# Test Engineer Review — RPF Cycle 36

**Date:** 2026-04-23
**Reviewer:** test-engineer
**Base commit:** 601ff71a

## Inventory of Files Reviewed

- Test files (`tests/`)
- Recruiting invitation routes
- Stats endpoint
- Chat widget
- SSE events route

## Findings

### TE-1: No test for PATCH invitation NaN bypass — same gap as AGG-2 [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts`

**Description:** The PATCH route's `expiryDate` construction has the same NaN bypass that was fixed in the POST routes, but no test exists for this scenario in any route. Adding a unit test for the `Invalid Date` bypass (sending `expiryDate` with a time component) would prevent regressions across all three routes.

**Fix:** Add a test case for invalid expiryDate in PATCH route (and POST routes for completeness):
```typescript
it("should reject invalidExpiryDate when date construction produces NaN", async () => {
  const res = await PATCH(requestWith({ expiryDate: "2026-01-01T00:00:00Z" }));
  expect(res.status).toBe(400);
});
```

**Confidence:** Medium

---

### TE-2: No test for stats query CTE reuse correctness [LOW/LOW — carry-over]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts`

**Description:** Carry-over from TE-3 in cycle 35. The stats query was refactored to reuse `user_best` CTE, but no integration test verifies the results match the previous double-scan approach.

**Confidence:** Low

---

### TE-3: Chat widget textarea aria-label — no accessibility test [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:363`

**Description:** No accessibility test verifies the textarea has an accessible name. This is a minor gap — the placeholder provides some context.

**Confidence:** Low
