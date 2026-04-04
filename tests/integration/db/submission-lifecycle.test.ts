import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  createTestDb,
  hasPostgresIntegrationSupport,
  seedUser,
  seedProblem,
  seedTestCase,
  seedSubmission,
  seedGroup,
  seedAssignment,
  seedAssignmentProblem,
  seedSubmissionResult,
  seedSubmissionComment,
  type TestDb,
} from "../support";
import {
  users,
  problems,
  submissions,
  submissionResults,
  submissionComments,
  testCases,
} from "@/lib/db/schema";
import { nanoid } from "nanoid";

describe.skipIf(!hasPostgresIntegrationSupport)("Submission lifecycle (integration)", () => {
  let ctx: TestDb;
  let userId: string;
  let problemId: string;

  beforeEach(async () => {
    ctx = await createTestDb();
    const user = await seedUser(ctx, { username: "submitter", role: "student" });
    const problem = await seedProblem(ctx, { title: "Sum Two Numbers" });
    userId = user.id;
    problemId = problem.id;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe("submit", () => {
    it("creates a submission in pending status", async () => {
      const sub = await seedSubmission(ctx, {
        userId,
        problemId,
        language: "python",
        sourceCode: "print(int(input()) + int(input()))",
      });

      const row = await ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.id, sub.id))
        .then((rows) => rows[0]);

      expect(row).toBeDefined();
      expect(row!.status).toBe("pending");
      expect(row!.userId).toBe(userId);
      expect(row!.problemId).toBe(problemId);
      expect(row!.language).toBe("python");
      expect(row!.sourceCode).toContain("print");
      expect(row!.submittedAt).toBeDefined();
    });

    it("creates a submission linked to an assignment", async () => {
      const instructor = await seedUser(ctx, { username: "prof", role: "instructor" });
      const group = await seedGroup(ctx, { instructorId: instructor.id });
      const assignment = await seedAssignment(ctx, { groupId: group.id, title: "HW1" });
      await seedAssignmentProblem(ctx, { assignmentId: assignment.id, problemId });

      const sub = await seedSubmission(ctx, {
        userId,
        problemId,
        assignmentId: assignment.id,
      });

      const row = await ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.id, sub.id))
        .then((rows) => rows[0]);

      expect(row!.assignmentId).toBe(assignment.id);
    });

    it("allows multiple submissions for the same user and problem", async () => {
      await seedSubmission(ctx, { userId, problemId, sourceCode: "attempt 1" });
      await seedSubmission(ctx, { userId, problemId, sourceCode: "attempt 2" });
      await seedSubmission(ctx, { userId, problemId, sourceCode: "attempt 3" });

      const rows = await ctx.db
        .select()
        .from(submissions)
        .where(and(eq(submissions.userId, userId), eq(submissions.problemId, problemId)));

      expect(rows).toHaveLength(3);
    });
  });

  describe("claim", () => {
    it("transitions pending to judging with a claim token", async () => {
      const sub = await seedSubmission(ctx, { userId, problemId, status: "pending" });
      const claimToken = nanoid();
      const claimedAt = new Date();

      await ctx.db
        .update(submissions)
        .set({
          status: "judging",
          judgeClaimToken: claimToken,
          judgeClaimedAt: claimedAt,
        })
        .where(and(eq(submissions.id, sub.id), eq(submissions.status, "pending")));

      const row = await ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.id, sub.id))
        .then((rows) => rows[0]);

      expect(row!.status).toBe("judging");
      expect(row!.judgeClaimToken).toBe(claimToken);
      expect(row!.judgeClaimedAt).toBeDefined();
    });

    it("does not claim an already-claimed submission (optimistic lock)", async () => {
      const sub = await seedSubmission(ctx, { userId, problemId, status: "judging" });

      const result = await ctx.db
        .update(submissions)
        .set({
          status: "judging",
          judgeClaimToken: "new-token",
          judgeClaimedAt: new Date(),
        })
        .where(and(eq(submissions.id, sub.id), eq(submissions.status, "pending")))
        .returning({ id: submissions.id });

      expect(result).toHaveLength(0);
    });

    it("claims the oldest pending submission", async () => {
      await seedSubmission(ctx, { userId, problemId, status: "pending" });
      await seedSubmission(ctx, { userId, problemId, status: "pending" });
      await seedSubmission(ctx, { userId, problemId, status: "pending" });

      const pending = await ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.status, "pending"));

      expect(pending.length).toBe(3);

      const claimToken = nanoid();
      await ctx.db
        .update(submissions)
        .set({ status: "judging", judgeClaimToken: claimToken })
        .where(and(eq(submissions.id, pending[0].id), eq(submissions.status, "pending")));

      const stillPending = await ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.status, "pending"));

      expect(stillPending.length).toBe(2);
    });
  });

  describe("judge", () => {
    it("records per-test-case results", async () => {
      const tc1 = await seedTestCase(ctx, { problemId, input: "1 2\n", expectedOutput: "3\n" });
      const tc2 = await seedTestCase(ctx, { problemId, input: "3 4\n", expectedOutput: "7\n" });
      const sub = await seedSubmission(ctx, { userId, problemId, status: "judging" });

      await seedSubmissionResult(ctx, {
        submissionId: sub.id,
        testCaseId: tc1.id,
        status: "accepted",
        actualOutput: "3\n",
        executionTimeMs: 15,
        memoryUsedKb: 8192,
      });
      await seedSubmissionResult(ctx, {
        submissionId: sub.id,
        testCaseId: tc2.id,
        status: "accepted",
        actualOutput: "7\n",
        executionTimeMs: 12,
        memoryUsedKb: 8100,
      });

      const results = await ctx.db
        .select()
        .from(submissionResults)
        .where(eq(submissionResults.submissionId, sub.id));

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === "accepted")).toBe(true);
    });

    it("finalizes submission as accepted with score and timing", async () => {
      const sub = await seedSubmission(ctx, { userId, problemId, status: "judging" });

      await ctx.db
        .update(submissions)
        .set({
          status: "accepted",
          score: 100,
          executionTimeMs: 42,
          memoryUsedKb: 16384,
          judgedAt: new Date(),
        })
        .where(eq(submissions.id, sub.id));

      const row = await ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.id, sub.id))
        .then((rows) => rows[0]);

      expect(row!.status).toBe("accepted");
      expect(row!.score).toBe(100);
      expect(row!.executionTimeMs).toBe(42);
      expect(row!.memoryUsedKb).toBe(16384);
      expect(row!.judgedAt).toBeDefined();
    });

    it("finalizes submission as wrong_answer with partial score", async () => {
      const sub = await seedSubmission(ctx, { userId, problemId, status: "judging" });

      await ctx.db
        .update(submissions)
        .set({
          status: "wrong_answer",
          score: 50,
          executionTimeMs: 100,
          memoryUsedKb: 32000,
          judgedAt: new Date(),
        })
        .where(eq(submissions.id, sub.id));

      const row = await ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.id, sub.id))
        .then((rows) => rows[0]);

      expect(row!.status).toBe("wrong_answer");
      expect(row!.score).toBe(50);
    });

    it("records compile_error with compile output", async () => {
      const sub = await seedSubmission(ctx, {
        userId,
        problemId,
        language: "cpp20",
        sourceCode: "invalid code {{{",
        status: "judging",
      });

      await ctx.db
        .update(submissions)
        .set({
          status: "compile_error",
          compileOutput: "error: expected ';' at end of declaration",
          score: 0,
          judgedAt: new Date(),
        })
        .where(eq(submissions.id, sub.id));

      const row = await ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.id, sub.id))
        .then((rows) => rows[0]);

      expect(row!.status).toBe("compile_error");
      expect(row!.compileOutput).toContain("expected");
      expect(row!.score).toBe(0);
    });
  });

  describe("relational queries", () => {
    it("loads submission with results via Drizzle query API", async () => {
      const tc = await seedTestCase(ctx, { problemId });
      const sub = await seedSubmission(ctx, { userId, problemId, status: "accepted" });
      await seedSubmissionResult(ctx, {
        submissionId: sub.id,
        testCaseId: tc.id,
        status: "accepted",
      });

      const result = await ctx.db.query.submissions.findFirst({
        where: eq(submissions.id, sub.id),
        with: { results: true },
      });

      expect(result).toBeDefined();
      expect(result!.results).toHaveLength(1);
      expect(result!.results[0].status).toBe("accepted");
    });

    it("loads submission with comments", async () => {
      const sub = await seedSubmission(ctx, { userId, problemId });
      const instructor = await seedUser(ctx, { username: "commenter", role: "instructor" });
      await seedSubmissionComment(ctx, {
        submissionId: sub.id,
        authorId: instructor.id,
        content: "Good approach, but consider edge cases.",
      });
      await seedSubmissionComment(ctx, {
        submissionId: sub.id,
        authorId: instructor.id,
        content: "Fixed in next revision.",
      });

      const result = await ctx.db.query.submissions.findFirst({
        where: eq(submissions.id, sub.id),
        with: { comments: true },
      });

      expect(result).toBeDefined();
      expect(result!.comments).toHaveLength(2);
    });

    it("loads problem with test cases and submissions", async () => {
      await seedTestCase(ctx, { problemId, input: "1\n", expectedOutput: "1\n" });
      await seedTestCase(ctx, { problemId, input: "2\n", expectedOutput: "4\n" });
      await seedSubmission(ctx, { userId, problemId });

      const result = await ctx.db.query.problems.findFirst({
        where: eq(problems.id, problemId),
        with: { testCases: true, submissions: true },
      });

      expect(result).toBeDefined();
      expect(result!.testCases).toHaveLength(2);
      expect(result!.submissions).toHaveLength(1);
    });
  });

  describe("cascade deletes", () => {
    it("deletes submission results when submission is deleted", async () => {
      const tc = await seedTestCase(ctx, { problemId });
      const sub = await seedSubmission(ctx, { userId, problemId });
      await seedSubmissionResult(ctx, {
        submissionId: sub.id,
        testCaseId: tc.id,
        status: "accepted",
      });

      const before = await ctx.db
        .select()
        .from(submissionResults)
        .where(eq(submissionResults.submissionId, sub.id));
      expect(before).toHaveLength(1);

      await ctx.db.delete(submissions).where(eq(submissions.id, sub.id));

      const after = await ctx.db
        .select()
        .from(submissionResults)
        .where(eq(submissionResults.submissionId, sub.id));
      expect(after).toHaveLength(0);
    });

    it("deletes submission comments when submission is deleted", async () => {
      const sub = await seedSubmission(ctx, { userId, problemId });
      await seedSubmissionComment(ctx, { submissionId: sub.id, content: "Nice!" });

      await ctx.db.delete(submissions).where(eq(submissions.id, sub.id));

      const remaining = await ctx.db
        .select()
        .from(submissionComments)
        .where(eq(submissionComments.submissionId, sub.id));
      expect(remaining).toHaveLength(0);
    });

    it("deletes test cases when problem is deleted", async () => {
      await seedTestCase(ctx, { problemId, input: "1\n", expectedOutput: "1\n" });
      await seedTestCase(ctx, { problemId, input: "2\n", expectedOutput: "2\n" });

      await ctx.db.delete(submissions).where(eq(submissions.problemId, problemId));
      await ctx.db.delete(problems).where(eq(problems.id, problemId));

      const remaining = await ctx.db
        .select()
        .from(testCases)
        .where(eq(testCases.problemId, problemId));
      expect(remaining).toHaveLength(0);
    });

    it("cascades user deletion to all submissions", async () => {
      await seedSubmission(ctx, { userId, problemId, sourceCode: "s1" });
      await seedSubmission(ctx, { userId, problemId, sourceCode: "s2" });

      await ctx.db.delete(users).where(eq(users.id, userId));

      const remaining = await ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.userId, userId));
      expect(remaining).toHaveLength(0);
    });
  });
});
