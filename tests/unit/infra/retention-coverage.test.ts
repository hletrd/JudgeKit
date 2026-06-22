import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Retention-coverage class-closer (RPF cycle-2 AGG2-5).
 *
 * History: unbounded-growth findings have been discovered one table at a
 * time — `source_drafts` in cycle 1 (F2/AGG-2), `code_snapshots` in cycle 2
 * (AGG2-1). This test closes the CLASS: every pgTable exported from
 * schema.pg.ts must be either
 *   (a) covered by the sensitive-data pruner (its schema export identifier
 *       appears in data-retention-maintenance.ts), or
 *   (b) on the explicit allowlist below with a one-line justification.
 *
 * Adding a new table forces a deliberate decision here: prune it or justify
 * keeping it forever. Do NOT add a table to the allowlist just to make this
 * test pass — that is exactly the failure mode this test exists to prevent.
 */

const SCHEMA_PATH = join(process.cwd(), "src/lib/db/schema.pg.ts");
const MAINTENANCE_PATH = join(process.cwd(), "src/lib/data-retention-maintenance.ts");

/**
 * Tables that deliberately have NO automatic retention prune. Each entry
 * must say why unbounded retention is correct for it.
 */
const NO_RETENTION_ALLOWLIST: Record<string, string> = {
  users: "account records; deleted via explicit admin/user deletion flows, cascades cover dependents",
  sessions: "auth-js managed; rows are deleted on logout/expiry by the auth layer",
  accounts: "auth-js managed OAuth account links; lifecycle tied to the user row",
  apiKeys: "explicitly issued credentials; revocation is a deliberate admin act, not a time window",
  groups: "organizational structure; deleted explicitly by instructors/admins",
  enrollments: "membership state, not telemetry; removed via roster management",
  groupInstructors: "membership state; removed via roster management",
  problems: "authored content; deletion is an explicit authorial/admin act",
  testCases: "authored content tied to problems; cascades with problem deletion",
  problemGroupAccess: "access mapping; lifecycle tied to problem/group deletion",
  assignments: "authored coursework structure; grading records reference it indefinitely",
  examSessions: "grading-relevant state (personal deadlines/extensions); must outlive the exam for appeals",
  assignmentProblems: "mapping table; lifecycle tied to assignment deletion",
  judgeWorkers: "fleet registry; rows removed via deregister/admin delete",
  languageConfigs: "configuration, bounded by the language registry size",
  systemSettings: "singleton configuration",
  realtimeCoordination: "ephemeral SSE connection/heartbeat coordination; rows self-expire and are cleaned inline",
  rateLimits: "self-expiring window state keyed for reuse; bounded by active key cardinality",
  submissionComments: "grading/feedback record; must live as long as the submission story",
  scoreOverrides: "grading integrity record; must be reconstructable for appeals",
  contestAnnouncements: "authored contest content; deleted with the contest flows",
  contestClarifications: "authored contest content; part of the contest record",
  problemSets: "authored content; explicit deletion",
  problemSetProblems: "mapping table; lifecycle tied to problem-set deletion",
  problemSetGroupAccess: "access mapping; lifecycle tied to set/group deletion",
  submissionResults: "per-test verdicts; cascade-deleted when their submission is pruned (FK)",
  plugins: "installed configuration; explicit admin lifecycle",
  discussionThreads: "community content; moderated/deleted explicitly",
  discussionPosts: "community content; moderated/deleted explicitly",
  communityVotes: "community state tied to posts; cascades with content deletion",
  contestAccessTokens: "self-expiring (expires_at checked at use); explicit revocation flows",
  roles: "configuration (custom role definitions)",
  tags: "taxonomy configuration",
  problemTags: "mapping table; lifecycle tied to problem/tag deletion",
  files: "user/problem assets with explicit delete + bulk-delete management routes",
  passwordResetTokens: "short-lived tokens; consumed/invalidated by the auth flow on use and reissue",
  emailVerificationTokens: "short-lived tokens; consumed/invalidated by the auth flow on use and reissue",
};

function listSchemaTables(source: string): string[] {
  const names: string[] = [];
  const re = /export const (\w+) = pgTable\(/g;
  for (let m = re.exec(source); m !== null; m = re.exec(source)) {
    names.push(m[1]);
  }
  return names;
}

describe("data-retention coverage of schema tables (class-closer)", () => {
  const schemaSource = readFileSync(SCHEMA_PATH, "utf8");
  const maintenanceSource = readFileSync(MAINTENANCE_PATH, "utf8");
  const tables = listSchemaTables(schemaSource);

  it("walker sanity: the schema walker actually finds the known tables", () => {
    // Guard against a refactor (e.g. pgTable wrapper/rename) silently making
    // this suite vacuous — mirrors the F5 CSP-matcher walker-sanity pattern.
    expect(tables.length).toBeGreaterThanOrEqual(40);
    expect(tables).toContain("submissions");
    expect(tables).toContain("codeSnapshots");
    expect(tables).toContain("sourceDrafts");
  });

  it("every table is either pruned by data-retention-maintenance or explicitly allowlisted", () => {
    const unaccounted = tables.filter((table) => {
      const pruned = new RegExp(`\\b${table}\\b`).test(maintenanceSource);
      const allowlisted = Object.prototype.hasOwnProperty.call(NO_RETENTION_ALLOWLIST, table);
      return !pruned && !allowlisted;
    });

    expect(
      unaccounted,
      `Tables with neither a retention prune nor an allowlist justification: ${unaccounted.join(", ")}. ` +
        "Either add a prune to data-retention-maintenance.ts (+ DATA_RETENTION_DAYS key + policy-doc row) " +
        "or add an allowlist entry here with a real justification."
    ).toEqual([]);
  });

  it("the allowlist is exact — no entry that is actually pruned, no unknown table names", () => {
    const tableSet = new Set(tables);
    const unknownEntries = Object.keys(NO_RETENTION_ALLOWLIST).filter((name) => !tableSet.has(name));
    expect(
      unknownEntries,
      `Allowlist entries that are not schema tables (stale after a rename/removal?): ${unknownEntries.join(", ")}`
    ).toEqual([]);

    const redundantlyAllowlisted = Object.keys(NO_RETENTION_ALLOWLIST).filter((name) =>
      new RegExp(`\\b${name}\\b`).test(maintenanceSource)
    );
    expect(
      redundantlyAllowlisted,
      `Allowlist entries that ARE pruned (remove them from the allowlist): ${redundantlyAllowlisted.join(", ")}`
    ).toEqual([]);
  });
});
