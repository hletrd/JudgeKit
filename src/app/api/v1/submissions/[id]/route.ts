import { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { assignments, submissions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { forbidden, notFound } from "@/lib/api/auth";
import { canAccessSubmission } from "@/lib/auth/permissions";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { createApiHandler } from "@/lib/api/handler";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
      with: {
        user: {
          columns: { name: true },
        },
        problem: {
          columns: { id: true, title: true },
        },
        results: {
          with: {
            testCase: {
              columns: { sortOrder: true, isVisible: true },
            },
          },
        },
      },
    });

    if (!submission) return notFound("Submission");

    const hasAccess = await canAccessSubmission(
      { userId: submission.userId, assignmentId: submission.assignmentId },
      user.id,
      user.role,
    );

    if (!hasAccess) {
      return forbidden();
    }

    const isOwner = submission.userId === user.id;
    const caps = await resolveCapabilities(user.role);
    const canViewSource = caps.has("submissions.view_source");
    const canViewAllResults = caps.has("submissions.view_all");

    // Strip hidden test case details for non-privileged users
    const sanitized = { ...submission };
    if (!canViewAllResults && sanitized.results) {
      sanitized.results = sanitized.results.map((r) => {
        const isVisible = r.testCase?.isVisible ?? false;
        if (!isVisible) {
          return { ...r, actualOutput: null, testCase: { isVisible: false as const, sortOrder: r.testCase?.sortOrder ?? null } };
        }
        return r;
      });
    }

    // Enforce assignment result visibility settings for non-privileged users
    if (!canViewAllResults && submission.assignmentId) {
      const assignmentRow = await db.query.assignments.findFirst({
        where: eq(assignments.id, submission.assignmentId),
        columns: { showResultsToCandidate: true, hideScoresFromCandidates: true },
      });
      const hideResults = !(assignmentRow?.showResultsToCandidate ?? false);
      const hideScores = assignmentRow?.hideScoresFromCandidates ?? false;
      if (hideResults) {
        (sanitized as Record<string, unknown>).results = [];
        (sanitized as Record<string, unknown>).compileOutput = null;
        (sanitized as Record<string, unknown>).executionTimeMs = null;
        (sanitized as Record<string, unknown>).memoryUsedKb = null;
        (sanitized as Record<string, unknown>).score = null;
      } else if (hideScores) {
        (sanitized as Record<string, unknown>).score = null;
      }
    }

    if (!isOwner && !canViewSource) {
      const { sourceCode: _sourceCode, ...rest } = sanitized;
      void _sourceCode;
      return apiSuccess(rest);
    }

    return apiSuccess(sanitized);
  },
});
