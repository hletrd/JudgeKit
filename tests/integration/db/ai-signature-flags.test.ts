/**
 * AI-use signature flags against a real PostgreSQL database: storage at
 * submission time, contest-wide token scope, recompute after a token change,
 * staff-only visibility (owner, co_instructor, TA; practice flags to the
 * problem author; never to admins by role alone or to students), and the
 * leaderboard counts.
 *
 * Skipped when SKIP_INTEGRATION_TESTS=1.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  createTestDb,
  seedAssignment,
  seedAssignmentProblem,
  seedGroup,
  seedProblem,
  seedRoles,
  seedSubmission,
  seedUser,
  type TestDb,
} from "../support";
import { groupInstructors, problems, submissionSignatureFlags, submissions } from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db;
  },
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: async (role: string) =>
    new Set(role === "admin" || role === "super_admin" ? ["groups.view_all", "submissions.view_all"] : []),
}));

describe.skipIf(process.env.SKIP_INTEGRATION_TESTS === "1")("AI signature flags (PostgreSQL)", () => {
  let testDb: TestDb;
  let flags: typeof import("@/lib/submissions/ai-signature-flags");

  const ids = {
    student: "",
    owner: "",
    coInstructor: "",
    ta: "",
    otherInstructor: "",
    admin: "",
    author: "",
    group: "",
    otherGroup: "",
    assignment: "",
    p1: "",
    p2: "",
    p3: "",
  };
  const subs: Record<string, string> = {};

  async function submit(key: string, problemId: string, assignmentId: string | null, sourceCode: string) {
    const row = await seedSubmission(testDb, {
      userId: ids.student,
      problemId,
      assignmentId,
      language: "cpp23" as never,
      sourceCode,
    });
    subs[key] = row.id;
    await flags.computeAndStoreSignatureFlag({ id: row.id, problemId, assignmentId, sourceCode });
    return row.id;
  }

  async function flaggedIds() {
    const rows = await testDb.db.select({ id: submissionSignatureFlags.submissionId }).from(submissionSignatureFlags);
    return new Set(rows.map((row) => row.id));
  }

  beforeAll(async () => {
    testDb = await createTestDb();
    holder.db = testDb.db;
    flags = await import("@/lib/submissions/ai-signature-flags");
    await seedRoles(testDb);

    ids.student = (await seedUser(testDb, { username: `s_${nanoid(5)}`, role: "student" })).id;
    ids.owner = (await seedUser(testDb, { username: `o_${nanoid(5)}`, role: "instructor" })).id;
    ids.coInstructor = (await seedUser(testDb, { username: `c_${nanoid(5)}`, role: "instructor" })).id;
    ids.ta = (await seedUser(testDb, { username: `t_${nanoid(5)}`, role: "instructor" })).id;
    ids.otherInstructor = (await seedUser(testDb, { username: `x_${nanoid(5)}`, role: "instructor" })).id;
    ids.admin = (await seedUser(testDb, { username: `a_${nanoid(5)}`, role: "admin" })).id;
    ids.author = (await seedUser(testDb, { username: `w_${nanoid(5)}`, role: "instructor" })).id;

    ids.group = (await seedGroup(testDb, { instructorId: ids.owner })).id;
    ids.otherGroup = (await seedGroup(testDb, { instructorId: ids.otherInstructor })).id;
    await testDb.db.insert(groupInstructors).values([
      { groupId: ids.group, userId: ids.coInstructor, role: "co_instructor" },
      { groupId: ids.group, userId: ids.ta, role: "ta" },
    ]);

    ids.p1 = (await seedProblem(testDb, {
      title: "Sum",
      description: "### 문제\n두 수의 합{{hidden: // sr5j}}{{signature: sr5j}}",
    })).id;
    ids.p2 = (await seedProblem(testDb, {
      title: "Max",
      description: "### 문제\n최댓값{{signature: tk9q}}\n{{signature: tk9q_b}}",
    })).id;
    ids.p3 = (await seedProblem(testDb, {
      title: "Practice",
      description: "연습{{signature: zz11}}",
      authorId: ids.author,
    })).id;

    ids.assignment = (await seedAssignment(testDb, { groupId: ids.group, title: "Contest" })).id;
    await seedAssignmentProblem(testDb, { assignmentId: ids.assignment, problemId: ids.p1, sortOrder: 0 });
    await seedAssignmentProblem(testDb, { assignmentId: ids.assignment, problemId: ids.p2, sortOrder: 1 });

    await submit("ownToken", ids.p1, ids.assignment, "// sr5j\nint main() { return 0; }");
    await submit("otherProblemToken", ids.p1, ids.assignment, "int tk9q_b = 0; int main() {}");
    await submit("substringOnly", ids.p2, ids.assignment, "int sr5jx = 0; int _tk9q = 1;");
    await submit("clean", ids.p2, ids.assignment, "int main() { return 0; }");
    await submit("practiceOtherToken", ids.p1, null, "int tk9q = 0;");
    await submit("practiceOwnToken", ids.p3, null, "/* zz11 */");
    await submit("laterToken", ids.p1, ids.assignment, "int nw77 = 0;");
  });

  afterAll(async () => {
    await testDb?.cleanup();
  });

  it("stores a flag only for whole-word matches within the submission's token scope", async () => {
    expect(await flaggedIds()).toEqual(
      new Set([subs.ownToken, subs.otherProblemToken, subs.practiceOwnToken]),
    );

    const [row] = await testDb.db
      .select({ matches: submissionSignatureFlags.matches })
      .from(submissionSignatureFlags)
      .where(eq(submissionSignatureFlags.submissionId, subs.otherProblemToken));
    // Another problem's token in the same contest counts, recorded with the
    // problem that defines it.
    expect(row.matches).toEqual([{ token: "tk9q_b", problemId: ids.p2 }]);
  });

  it("resolves the viewer scope: group staff and problem authors only", async () => {
    const scope = (id: string, role: string) => flags.resolveSignatureFlagViewerScope({ id, role });
    expect(await scope(ids.student, "student")).toBeNull();
    expect(await flags.resolveSignatureFlagViewerScope(null)).toBeNull();
    // An admin by role alone (groups.view_all) is not staff of any group.
    expect(await scope(ids.admin, "admin")).toBeNull();
    expect(await scope(ids.admin, "super_admin")).toBeNull();
    for (const id of [ids.owner, ids.coInstructor, ids.ta]) {
      expect(await scope(id, "instructor")).toEqual({ userId: id, groupIds: [ids.group], authorsProblems: false });
    }
    expect(await scope(ids.author, "instructor")).toEqual({
      userId: ids.author,
      groupIds: [],
      authorsProblems: true,
    });
  });

  it("returns flags only to viewers who may see them", async () => {
    const all = Object.values(subs);
    const view = async (id: string, role: string) =>
      new Set((await flags.getSignatureFlagsForSubmissions(
        all,
        await flags.resolveSignatureFlagViewerScope({ id, role }),
      )).keys());
    const contestFlags = new Set([subs.ownToken, subs.otherProblemToken]);

    expect((await view(ids.student, "student")).size).toBe(0);
    expect((await view(ids.otherInstructor, "instructor")).size).toBe(0);
    // Admin by role only: neither contest nor practice flags.
    expect((await view(ids.admin, "admin")).size).toBe(0);

    // Group owner, co_instructor, and TA: the contest submissions of their
    // group only; practice flags belong to the problem's author.
    expect(await view(ids.owner, "instructor")).toEqual(contestFlags);
    expect(await view(ids.coInstructor, "instructor")).toEqual(contestFlags);
    expect(await view(ids.ta, "instructor")).toEqual(contestFlags);
    expect(await view(ids.author, "instructor")).toEqual(new Set([subs.practiceOwnToken]));

    const ownerView = await flags.getSignatureFlagsForSubmissions(
      all,
      await flags.resolveSignatureFlagViewerScope({ id: ids.owner, role: "instructor" }),
    );
    expect(ownerView.get(subs.ownToken)).toEqual({
      matches: [{ token: "sr5j", problemId: ids.p1, problemTitle: "Sum" }],
    });
  });

  it("decides contest aggregates with the same rule", async () => {
    expect(await flags.canViewContestSignatureFlags({ id: ids.owner }, ids.group)).toBe(true);
    expect(await flags.canViewContestSignatureFlags({ id: ids.coInstructor }, ids.group)).toBe(true);
    expect(await flags.canViewContestSignatureFlags({ id: ids.ta }, ids.group)).toBe(true);
    expect(await flags.canViewContestSignatureFlags({ id: ids.admin, role: "admin" }, ids.group)).toBe(false);
    expect(await flags.canViewContestSignatureFlags({ id: ids.student, role: "student" }, ids.group)).toBe(false);
    expect(await flags.canViewContestSignatureFlags({ id: ids.otherInstructor }, ids.group)).toBe(false);
    expect(await flags.canViewContestSignatureFlags({ id: ids.author }, ids.group)).toBe(false);
    expect(await flags.canViewContestSignatureFlags(null, ids.group)).toBe(false);
  });

  it("filters a submissions query to visible flagged rows", async () => {
    const filtered = async (scope: Parameters<typeof flags.visibleSignatureFlagFilterSql>[0]) =>
      new Set((await testDb.db
        .select({ id: submissions.id })
        .from(submissions)
        .where(flags.visibleSignatureFlagFilterSql(scope))).map((row) => row.id));
    expect(await filtered({ userId: ids.ta, groupIds: [ids.group], authorsProblems: false })).toEqual(
      new Set([subs.ownToken, subs.otherProblemToken]),
    );
    expect(await filtered({ userId: ids.author, groupIds: [], authorsProblems: true })).toEqual(
      new Set([subs.practiceOwnToken]),
    );
    expect(await filtered({ userId: ids.author, groupIds: [ids.group], authorsProblems: true })).toEqual(
      new Set([subs.ownToken, subs.otherProblemToken, subs.practiceOwnToken]),
    );
    expect((await filtered({ userId: ids.admin, groupIds: [], authorsProblems: false })).size).toBe(0);
  });

  it("counts flagged submissions per student and problem for the leaderboard", async () => {
    expect(await flags.getContestSignatureFlagCounts(ids.assignment)).toEqual({
      [ids.student]: { total: 2, problems: { [ids.p1]: 2 } },
    });
  });

  it("re-flags the problem's submissions and its contests after a token change", async () => {
    await testDb.db
      .update(problems)
      .set({ description: "### 문제\n두 수의 합{{signature: nw77}}" })
      .where(eq(problems.id, ids.p1));

    const result = await flags.recomputeSignatureFlagsForProblem(ids.p1);
    // p1's own submissions plus every submission of the contest (p2's too).
    expect(result.scanned).toBe(6);
    expect(await flaggedIds()).toEqual(
      new Set([subs.laterToken, subs.otherProblemToken, subs.practiceOwnToken]),
    );
  });

  it("recomputes everything from scratch with the same result", async () => {
    const before = await flaggedIds();
    await testDb.db.delete(submissionSignatureFlags);
    const result = await flags.recomputeAllSignatureFlags();
    expect(result.flagged).toBe(before.size);
    expect(await flaggedIds()).toEqual(before);
  });

  it("clears every flag when the markers are removed", async () => {
    await testDb.db.update(problems).set({ description: "no markers" });
    await flags.recomputeAllSignatureFlags();
    expect((await flaggedIds()).size).toBe(0);
  });
});
