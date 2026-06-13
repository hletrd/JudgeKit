import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RPF cycle-7 AGG7-2 — offset/cap listing total-order contract.
 *
 * Source-grep contract test (legitimate per the source-grep-inventory note:
 * this is a cross-route invariant about query SHAPE that would otherwise need
 * a full db-chain mock per route — the behavioural arity pins live with the
 * routes that already have a chain harness, e.g. submissions and the
 * anti-cheat GET). Every offset-paginated or row-capped listing must order by
 * a UNIQUE second key (`id`) after its non-unique timestamp, so same-timestamp
 * rows do not shuffle across pages and the CSV cap boundary is deterministic.
 *
 * Cycle-6 fixed the submissions listing; cycle-7 propagates the same contract
 * to its siblings. A regression that drops the id tiebreak fails this gate.
 */

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const cases: Array<{ file: string; table: string }> = [
  { file: "src/app/api/v1/admin/audit-logs/route.ts", table: "auditEvents" },
  { file: "src/app/api/v1/admin/login-logs/route.ts", table: "loginEvents" },
  { file: "src/app/api/v1/users/route.ts", table: "users" },
  { file: "src/app/api/v1/files/route.ts", table: "files" },
  { file: "src/app/api/v1/problems/route.ts", table: "problems" },
];

describe("listing-order id tiebreak (AGG7-2)", () => {
  for (const { file, table } of cases) {
    it(`${file} orders by (${table}.createdAt desc, ${table}.id desc)`, () => {
      const source = read(file);
      // The two-key order must appear; a single-key createdAt order must NOT
      // remain (that was the shuffle bug).
      expect(
        source,
        `${file} must use (createdAt desc, id desc)`
      ).toContain(`desc(${table}.createdAt), desc(${table}.id)`);
      expect(
        source,
        `${file} must not keep a single-key createdAt order`
      ).not.toMatch(
        new RegExp(`orderBy\\(desc\\(${table}\\.createdAt\\)\\)`)
      );
    });
  }
});

/**
 * RPF cycle-9 AGG9-1/2/3 — three offset-paged listings in the SAME class that
 * slipped the cycle-7 5-route allow-list above. They use different orderings
 * (ascending timestamp, plain column, or a sort-mode branch) so the assertions
 * are tailored: each must carry the unique `id` tiebreak and must NOT keep its
 * single-key order. A regression that drops the id tiebreak fails this gate.
 */
describe("listing-order id tiebreak (AGG9 — completing the sweep)", () => {
  it("code-snapshots timeline orders by (createdAt asc, id asc)", () => {
    const source = read(
      "src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts"
    );
    expect(
      source,
      "code-snapshots must use (createdAt asc, id asc) — paged anti-cheat evidence"
    ).toContain("asc(codeSnapshots.createdAt), asc(codeSnapshots.id)");
    expect(
      source,
      "code-snapshots must not keep a single-key createdAt order"
    ).not.toMatch(/orderBy\(asc\(codeSnapshots\.createdAt\)\)/);
  });

  it("recruiting-invitation list orders by (createdAt, id)", () => {
    const source = read("src/lib/assignments/recruiting-invitations.ts");
    expect(
      source,
      "recruiting-invitation list must carry the id tiebreak"
    ).toContain("recruitingInvitations.createdAt, recruitingInvitations.id");
    expect(
      source,
      "recruiting-invitation list must not keep a single-key createdAt order"
    ).not.toMatch(/orderBy\(recruitingInvitations\.createdAt\)/);
  });

  it("accepted-solutions sort modes all end in a unique id tiebreak", () => {
    const source = read(
      "src/app/api/v1/problems/[id]/accepted-solutions/route.ts"
    );
    expect(
      source,
      "accepted-solutions must carry desc(submissions.id) in its sort clauses"
    ).toContain("desc(submissions.id)");
    expect(
      source,
      "accepted-solutions newest branch must not be desc(submittedAt) alone"
    ).not.toMatch(/:\s*\[desc\(submissions\.submittedAt\)\];/);
  });
});
