import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Source-level invariant: redeemAccessCode must execute inside a single
 * db.transaction(...) so the existing-redemption check and the downstream
 * contestAccessTokens insert are serialized. A behavioral race-condition
 * test requires a live Postgres fixture (see tests/integration/**); this
 * file is the cheap change-detection guard that catches a refactor that
 * would move the guarding check outside the transaction.
 *
 * Scoped to HIGH-19 of plans/open/2026-04-18-comprehensive-review-remediation.md.
 */
describe("redeemAccessCode source invariants", () => {
  const source = readFileSync(
    path.resolve(__dirname, "../../../src/lib/assignments/access-codes.ts"),
    "utf8"
  );

  it("wraps the redeem flow in a db.transaction()", () => {
    expect(source).toContain("export async function redeemAccessCode");
    expect(source).toContain("await db.transaction(");
  });

  it("checks for an existing contestAccessTokens row inside the transaction", () => {
    const txBlock = source.slice(source.indexOf("await db.transaction("));
    expect(txBlock).toMatch(/contestAccessTokens/);
    expect(txBlock).toMatch(/already redeemed|alreadyJoined|existing/i);
  });

  it("uses onConflictDoNothing on the enrollment insert to avoid double-enroll", () => {
    expect(source).toMatch(/onConflictDoNothing\s*\(\s*\{/);
  });

  it("catches unique constraint violation (23505) on contestAccessTokens and returns alreadyEnrolled", () => {
    // When two concurrent transactions both pass the existing-token check,
    // the DB unique constraint on (assignmentId, userId) guarantees only one
    // insert succeeds. The loser must get a graceful alreadyEnrolled response.
    const catchBlock = source.slice(source.indexOf("catch (err: unknown)"));
    expect(catchBlock).toContain('"23505"');
    expect(catchBlock).toMatch(/alreadyEnrolled:\s*true/);
  });

  it("reads assignment inside the transaction for a consistent snapshot (TOCTOU-safe)", () => {
    const txBlock = source.slice(source.indexOf("await db.transaction("));
    // The assignment SELECT must happen inside tx, not before it
    const beforeTx = source.slice(0, source.indexOf("await db.transaction("));
    expect(beforeTx).not.toMatch(/await\s+tx\.select.*assignments/);
    expect(txBlock).toMatch(/await\s+tx\.select/);
    expect(txBlock).toMatch(/assignments\.\w+/);
  });
});
