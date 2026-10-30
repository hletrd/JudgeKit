import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  seedRoles,
  seedUser,
  seedProblem,
  seedSubmission,
  seedGroup,
  seedEnrollment,
  seedAssignment,
  seedAssignmentProblem,
  type TestDb,
} from "../support";
import { assignments, scoreOverrides, submissions } from "@/lib/db/schema";
import { namedToPositional } from "@/lib/db/named-params";
import {
  ICPC_CONTEST_STATS_SQL,
  IOI_CONTEST_STATS_SQL,
} from "@/lib/assignments/contest-stats-sql";

type StatsRow = {
  participantCount: number;
  submittedCount: number;
  avgScore: number;
  problemsSolvedCount: number;
};

describe.skipIf(process.env.SKIP_INTEGRATION_TESTS === "1")("Contest stats SQL (integration)", () => {
  let ctx: TestDb;
  let groupId: string;
  let assignmentId: string;

  async function runStats(sql: string, params: Record<string, unknown>) {
    const { text, values } = namedToPositional(sql, params);
    const result = await ctx.client.query<StatsRow>(text, values);
    return result.rows[0];
  }

  beforeEach(async () => {
    ctx = await createTestDb();
    await seedRoles(ctx);
    const instructor = await seedUser(ctx, { username: "prof", role: "instructor" });
    const first = await seedUser(ctx, { username: "first", role: "student" });
    const second = await seedUser(ctx, { username: "second", role: "student" });
    const group = await seedGroup(ctx, { instructorId: instructor.id });
    groupId = group.id;
    await seedEnrollment(ctx, { userId: first.id, groupId });
    await seedEnrollment(ctx, { userId: second.id, groupId });

    const assignment = await seedAssignment(ctx, { groupId, title: "Midterm" });
    assignmentId = assignment.id;
    const full = await seedProblem(ctx, { title: "Full" });
    const half = await seedProblem(ctx, { title: "Half" });
    await seedAssignmentProblem(ctx, { assignmentId, problemId: full.id, points: 100, sortOrder: 0 });
    await seedAssignmentProblem(ctx, { assignmentId, problemId: half.id, points: 50, sortOrder: 1 });

    const accepted = await seedSubmission(ctx, {
      userId: first.id,
      problemId: full.id,
      assignmentId,
      status: "accepted",
    });
    await ctx.db.update(submissions).set({ score: 100 }).where(eq(submissions.id, accepted.id));
    const partial = await seedSubmission(ctx, {
      userId: second.id,
      problemId: full.id,
      assignmentId,
      status: "wrong_answer",
    });
    await ctx.db.update(submissions).set({ score: 50 }).where(eq(submissions.id, partial.id));

    // override_score is double precision; mixing it into the totals is what
    // used to break ROUND(AVG(...), 1) for every IOI contest.
    await ctx.db.insert(scoreOverrides).values({
      assignmentId,
      problemId: half.id,
      userId: second.id,
      overrideScore: 30,
    });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("computes IOI stats with score overrides", async () => {
    const row = await runStats(IOI_CONTEST_STATS_SQL, {
      groupId,
      assignmentId,
      deadlineMs: null,
      latePenalty: 0,
      examMode: "none",
    });

    // first: 100; second: 50 judged + 30 override = 80.
    expect(row).toEqual({
      participantCount: 2,
      submittedCount: 2,
      avgScore: 90,
      problemsSolvedCount: 1,
    });
  });

  it("computes ICPC stats as solved-problem counts", async () => {
    await ctx.db.update(assignments).set({ scoringModel: "icpc" }).where(eq(assignments.id, assignmentId));

    const row = await runStats(ICPC_CONTEST_STATS_SQL, { groupId, assignmentId });

    expect(row).toEqual({
      participantCount: 2,
      submittedCount: 2,
      avgScore: 0.5,
      problemsSolvedCount: 1,
    });
  });
});
