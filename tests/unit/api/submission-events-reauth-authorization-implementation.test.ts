import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Source-text contract for the SSE re-auth authorization re-check (C3-AGG-6).
 *
 * The periodic re-auth IIFE in the submission-events route used to re-check
 * IDENTITY only (getApiUser + viewerId comparison). A viewer whose group
 * access was revoked or who was downgraded mid-stream kept receiving events
 * until their session expired, because `canAccessSubmission` ran only at
 * stream open. Five cycle-3 agents confirmed the gap (code-reviewer C3-N5,
 * critic #5, debugger F3, tracer F2, security C3-6).
 *
 * The durable invariant is that the re-auth path RE-RUNS canAccessSubmission
 * (not just identity). A behavioural test would need to drive the long-lived
 * poll loop past AUTH_RECHECK_INTERVAL_MS — disproportionately heavy vs. the
 * wiring invariant — so the contract is pinned as source text, matching the
 * repo's established pattern for SSE/realtime wiring guards.
 */
describe("submission-events re-auth re-runs canAccessSubmission (C3-AGG-6)", () => {
  const source = readFileSync(
    "src/app/api/v1/submissions/[id]/events/route.ts",
    "utf8"
  );

  it("the re-auth IIFE re-fetches the submission reader and re-runs canAccessSubmission", () => {
    // The IIFE must re-run the authorization gate after the identity check.
    expect(source).toContain("await canAccessSubmission(refreshedReader, reAuthUser.id, reAuthUser.role)");
    // And it must re-fetch the submission's access-relevant columns (userId/assignmentId).
    expect(source).toContain("columns: { userId: true, assignmentId: true }");
    // The close-on-failure branch must be present (missing row OR revoked access closes).
    expect(source).toContain("if (!refreshedReader || !(await canAccessSubmission(refreshedReader, reAuthUser.id, reAuthUser.role)))");
  });

  it("the identity check still precedes the authorization re-check", () => {
    const identityIdx = source.indexOf("reAuthUser.id !== viewerId");
    const authzIdx = source.indexOf("await canAccessSubmission(refreshedReader");
    expect(identityIdx).toBeGreaterThan(-1);
    expect(authzIdx).toBeGreaterThan(-1);
    expect(authzIdx).toBeGreaterThan(identityIdx);
  });
});
