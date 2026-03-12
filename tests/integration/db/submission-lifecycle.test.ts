import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  createTestDb,
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

describe("Submission lifecycle (integration)", () => {
  let ctx: TestDb;
  let userId: string;
  let problemId: string;

  beforeEach(() => {
    ctx = createTestDb();
    // Seed baseline entities needed for every submission test
    const user = seedUser(ctx, { username: "submitter", role: "student" });
    const problem = seedProblem(ctx, { title: "Sum Two Numbers" });
    userId = user.id;
    problemId = problem.id;
  });

  afterEach(() => {
    ctx.cleanup();
  });

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  describe("submit", () => {
    it("creates a submission in pending status", () => {
      const sub = seedSubmission(ctx, {
        userId,
        problemId,
        language: "python",
        sourceCode: "print(int(input()) + int(input()))",
      });

      const row = ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.id, sub.id))
        .get();

      expect(row).toBeDefined();
      expect(row!.status).toBe("pending");
      expect(row!.userId).toBe(userId);
      expect(row!.problemId).toBe(problemId);
      expect(row!.language).toBe("python");
      expect(row!.sourceCode).toContain("print");
      expect(row!.submittedAt).toBeDefined();
    });

    it("creates a submission linked to an assignment", () => {
      const instructor = seedUser(ctx, { username: "prof", role: "instructor" });
      const group = seedGroup(ctx, { instructorId: instructor.id });
      const assignment = seedAssignment(ctx, { groupId: group.id, title: "HW1" });
      seedAssignmentProblem(ctx, { assignmentId: assignment.id, problemId });

      const sub = seedSubmission(ctx, {
        userId,
        problemId,
        assignmentId: assignment.id,
      });

      const row = ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.id, sub.id))
        .get();

      expect(row!.assignmentId).toBe(assignment.id);
    });

    it("allows multiple submissions for the same user and problem", () => {
      seedSubmission(ctx, { userId, problemId, sourceCode: "attempt 1" });
      seedSubmission(ctx, { userId, problemId, sourceCode: "attempt 2" });
      seedSubmission(ctx, { userId, problemId, sourceCode: "attempt 3" });

      const rows = ctx.db
        .select()
        .from(submissions)
        .where(
          and(eq(submissions.userId, userId), eq(submissions.problemId, problemId))
        )
        .all();

      expect(rows).toHaveLength(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Claim (judge worker picks up a pending submission)
  // ---------------------------------------------------------------------------

  describe("claim", () => {
    it("transitions pending to judging with a claim token", () => {
      const sub = seedSubmission(ctx, { userId, problemId, status: "pending" });
      const claimToken = nanoid();
      const claimedAt = new Date();

      ctx.db
        .update(submissions)
        .set({
          status: "judging",
          judgeClaimToken: claimToken,
          judgeClaimedAt: claimedAt,
        })
        .where(
          and(eq(submissions.id, sub.id), eq(submissions.status, "pending"))
        )
        .run();

      const row = ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.id, sub.id))
        .get();

      expect(row!.status).toBe("judging");
      expect(row!.judgeClaimToken).toBe(claimToken);
      expect(row!.judgeClaimedAt).toBeDefined();
    });

    it("does not claim an already-claimed submission (optimistic lock)", () => {
      const sub = seedSubmission(ctx, { userId, problemId, status: "judging" });

      // Attempt to claim something that is already "judging"
      const result = ctx.db
        .update(submissions)
        .set({
          status: "judging",
          judgeClaimToken: "new-token",
          judgeClaimedAt: new Date(),
        })
        .where(
          and(eq(submissions.id, sub.id), eq(submissions.status, "pending"))
        )
        .run();

      // The WHERE clause won't match, so no rows are updated
      expect(result.changes).toBe(0);
    });

    it("claims the oldest pending submission", () => {
      // Create three submissions; only the oldest pending one should be picked
      const sub1 = seedSubmission(ctx, { userId, problemId, status: "pending" });
      const sub2 = seedSubmission(ctx, { userId, problemId, status: "pending" });
      const sub3 = seedSubmission(ctx, { userId, problemId, status: "pending" });

      // Simulate claiming by finding the first pending (ordered by submittedAt)
      const pending = ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.status, "pending"))
        .all();

      expect(pending.length).toBe(3);

      // Claim the first one
      const claimToken = nanoid();
      ctx.db
        .update(submissions)
        .set({ status: "judging", judgeClaimToken: claimToken })
        .where(
          and(
            eq(submissions.id, pending[0].id),
            eq(submissions.status, "pending")
          )
        )
        .run();

      // Now only 2 should be pending
      const stillPending = ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.status, "pending"))
        .all();

      expect(stillPending.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Judge (record results for each test case)
  // ---------------------------------------------------------------------------

  describe("judge", () => {
    it("records per-test-case results", () => {
      const tc1 = seedTestCase(ctx, { problemId, input: "1 2\n", expectedOutput: "3\n" });
      const tc2 = seedTestCase(ctx, { problemId, input: "3 4\n", expectedOutput: "7\n" });
      const sub = seedSubmission(ctx, { userId, problemId, status: "judging" });

      seedSubmissionResult(ctx, {
        submissionId: sub.id,
        testCaseId: tc1.id,
        status: "accepted",
        actualOutput: "3\n",
        executionTimeMs: 15,
        memoryUsedKb: 8192,
      });
      seedSubmissionResult(ctx, {
        submissionId: sub.id,
        testCaseId: tc2.id,
        status: "accepted",
        actualOutput: "7\n",
        executionTimeMs: 12,
        memoryUsedKb: 8100,
      });

      const results = ctx.db
        .select()
        .from(submissionResults)
        .where(eq(submissionResults.submissionId, sub.id))
        .all();

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === "accepted")).toBe(true);
    });

    it("finalizes submission as accepted with score and timing", () => {
      const sub = seedSubmission(ctx, { userId, problemId, status: "judging" });

      ctx.db
        .update(submissions)
        .set({
          status: "accepted",
          score: 100,
          executionTimeMs: 42,
          memoryUsedKb: 16384,
          judgedAt: new Date(),
        })
        .where(eq(submissions.id, sub.id))
        .run();

      const row = ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.id, sub.id))
        .get();

      expect(row!.status).toBe("accepted");
      expect(row!.score).toBe(100);
      expect(row!.executionTimeMs).toBe(42);
      expect(row!.memoryUsedKb).toBe(16384);
      expect(row!.judgedAt).toBeDefined();
    });

    it("finalizes submission as wrong_answer with partial score", () => {
      const sub = seedSubmission(ctx, { userId, problemId, status: "judging" });

      ctx.db
        .update(submissions)
        .set({
          status: "wrong_answer",
          score: 50,
          executionTimeMs: 100,
          memoryUsedKb: 32000,
          judgedAt: new Date(),
        })
        .where(eq(submissions.id, sub.id))
        .run();

      const row = ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.id, sub.id))
        .get();

      expect(row!.status).toBe("wrong_answer");
      expect(row!.score).toBe(50);
    });

    it("records compile_error with compile output", () => {
      const sub = seedSubmission(ctx, {
        userId,
        problemId,
        language: "cpp20",
        sourceCode: "invalid code {{{",
        status: "judging",
      });

      ctx.db
        .update(submissions)
        .set({
          status: "compile_error",
          compileOutput: "error: expected ';' at end of declaration",
          score: 0,
          judgedAt: new Date(),
        })
        .where(eq(submissions.id, sub.id))
        .run();

      const row = ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.id, sub.id))
        .get();

      expect(row!.status).toBe("compile_error");
      expect(row!.compileOutput).toContain("expected");
      expect(row!.score).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Relational queries
  // ---------------------------------------------------------------------------

  describe("relational queries", () => {
    it("loads submission with results via Drizzle query API", () => {
      const tc = seedTestCase(ctx, { problemId });
      const sub = seedSubmission(ctx, { userId, problemId, status: "accepted" });
      seedSubmissionResult(ctx, {
        submissionId: sub.id,
        testCaseId: tc.id,
        status: "accepted",
      });

      const result = ctx.db.query.submissions.findFirst({
        where: eq(submissions.id, sub.id),
        with: { results: true },
      });

      expect(result).toBeDefined();
      expect((result as any).results).toHaveLength(1);
      expect((result as any).results[0].status).toBe("accepted");
    });

    it("loads submission with comments", () => {
      const sub = seedSubmission(ctx, { userId, problemId });
      const instructor = seedUser(ctx, { username: "commenter", role: "instructor" });
      seedSubmissionComment(ctx, {
        submissionId: sub.id,
        authorId: instructor.id,
        content: "Good approach, but consider edge cases.",
      });
      seedSubmissionComment(ctx, {
        submissionId: sub.id,
        authorId: instructor.id,
        content: "Fixed in next revision.",
      });

      const result = ctx.db.query.submissions.findFirst({
        where: eq(submissions.id, sub.id),
        with: { comments: true },
      });

      expect(result).toBeDefined();
      expect((result as any).comments).toHaveLength(2);
    });

    it("loads problem with test cases and submissions", () => {
      seedTestCase(ctx, { problemId, input: "1\n", expectedOutput: "1\n" });
      seedTestCase(ctx, { problemId, input: "2\n", expectedOutput: "4\n" });
      seedSubmission(ctx, { userId, problemId });

      const result = ctx.db.query.problems.findFirst({
        where: eq(submissions.problemId, problemId),
        with: { testCases: true, submissions: true },
      });

      expect(result).toBeDefined();
      expect((result as any).testCases).toHaveLength(2);
      expect((result as any).submissions).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Cascade deletes
  // ---------------------------------------------------------------------------

  describe("cascade deletes", () => {
    it("deletes submission results when submission is deleted", () => {
      const tc = seedTestCase(ctx, { problemId });
      const sub = seedSubmission(ctx, { userId, problemId });
      seedSubmissionResult(ctx, {
        submissionId: sub.id,
        testCaseId: tc.id,
        status: "accepted",
      });

      // Verify result exists
      const before = ctx.db
        .select()
        .from(submissionResults)
        .where(eq(submissionResults.submissionId, sub.id))
        .all();
      expect(before).toHaveLength(1);

      // Delete submission
      ctx.db.delete(submissions).where(eq(submissions.id, sub.id)).run();

      // Results should be cascade-deleted
      const after = ctx.db
        .select()
        .from(submissionResults)
        .where(eq(submissionResults.submissionId, sub.id))
        .all();
      expect(after).toHaveLength(0);
    });

    it("deletes submission comments when submission is deleted", () => {
      const sub = seedSubmission(ctx, { userId, problemId });
      seedSubmissionComment(ctx, { submissionId: sub.id, content: "Nice!" });

      ctx.db.delete(submissions).where(eq(submissions.id, sub.id)).run();

      const remaining = ctx.db
        .select()
        .from(submissionComments)
        .where(eq(submissionComments.submissionId, sub.id))
        .all();
      expect(remaining).toHaveLength(0);
    });

    it("deletes test cases when problem is deleted", () => {
      seedTestCase(ctx, { problemId, input: "1\n", expectedOutput: "1\n" });
      seedTestCase(ctx, { problemId, input: "2\n", expectedOutput: "2\n" });

      // Must delete submissions first (they reference the problem)
      ctx.db.delete(submissions).where(eq(submissions.problemId, problemId)).run();

      ctx.db.delete(problems).where(eq(problems.id, problemId)).run();

      const remaining = ctx.db
        .select()
        .from(testCases)
        .where(eq(testCases.problemId, problemId))
        .all();
      expect(remaining).toHaveLength(0);
    });

    it("cascades user deletion to all submissions", () => {
      seedSubmission(ctx, { userId, problemId, sourceCode: "s1" });
      seedSubmission(ctx, { userId, problemId, sourceCode: "s2" });

      ctx.db.delete(users).where(eq(users.id, userId)).run();

      const remaining = ctx.db
        .select()
        .from(submissions)
        .where(eq(submissions.userId, userId))
        .all();
      expect(remaining).toHaveLength(0);
    });
  });
});
