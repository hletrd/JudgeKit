import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { languageConfigs, problems, submissions } from "@/lib/db/schema";
import { isJudgeLanguage } from "@/lib/judge/languages";
import { and, desc, eq } from "drizzle-orm";
import { getApiUser, unauthorized, isAdmin } from "@/lib/api/auth";
import { recordAuditEvent } from "@/lib/audit/events";
import { canAccessProblem } from "@/lib/auth/permissions";
import {
  getStudentAssignmentContextsForProblem,
  validateAssignmentSubmission,
} from "@/lib/assignments/submissions";
import {
  MAX_SOURCE_CODE_SIZE_BYTES,
  isSubmissionStatus,
} from "@/lib/security/constants";
import { generateSubmissionId } from "@/lib/submissions/id";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;
    const problemId = searchParams.get("problemId");
    const status = searchParams.get("status");

    if (status && !isSubmissionStatus(status)) {
      return NextResponse.json({ error: "invalidSubmissionStatus" }, { status: 400 });
    }

    const userFilter = isAdmin(user.role) ? undefined : eq(submissions.userId, user.id);
    const problemFilter = problemId ? eq(submissions.problemId, problemId) : undefined;
    const statusFilter = status ? eq(submissions.status, status) : undefined;
    const filters = [userFilter, problemFilter, statusFilter].flatMap((filter) =>
      filter ? [filter] : []
    );
    const whereClause =
      filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);

    const results = await db.query.submissions.findMany({
      where: whereClause,
      orderBy: [desc(submissions.submittedAt)],
      limit,
      offset,
    });

    return NextResponse.json({ data: results, page, limit });
  } catch (error) {
    console.error("GET /api/v1/submissions error:", error);
    return NextResponse.json({ error: "submissionLoadFailed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const body = await request.json();
    const { problemId, language, sourceCode, assignmentId } = body;
    const normalizedAssignmentId =
      assignmentId == null
        ? null
        : typeof assignmentId === "string"
          ? assignmentId.trim() || null
          : undefined;

    if (!problemId || typeof problemId !== "string") {
      return NextResponse.json({ error: "problemRequired" }, { status: 400 });
    }
    if (!language || typeof language !== "string") {
      return NextResponse.json({ error: "languageRequired" }, { status: 400 });
    }
    if (!sourceCode || typeof sourceCode !== "string") {
      return NextResponse.json({ error: "sourceCodeRequired" }, { status: 400 });
    }
    if (normalizedAssignmentId === undefined) {
      return NextResponse.json({ error: "invalidAssignmentId" }, { status: 400 });
    }
    if (!isJudgeLanguage(language)) {
      return NextResponse.json({ error: "languageNotSupported" }, { status: 400 });
    }

    if (Buffer.byteLength(sourceCode, "utf8") > MAX_SOURCE_CODE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: "sourceCodeTooLarge",
        },
        { status: 413 }
      );
    }

    const problem = await db.query.problems.findFirst({
      where: eq(problems.id, problemId),
      columns: { id: true, title: true },
    });

    if (!problem) {
      return NextResponse.json({ error: "problemNotFound" }, { status: 404 });
    }

    if (!normalizedAssignmentId && user.role === "student") {
      const assignmentContexts = await getStudentAssignmentContextsForProblem(problemId, user.id);

      if (assignmentContexts.length > 0) {
        return NextResponse.json({ error: "assignmentContextRequired" }, { status: 409 });
      }
    }

    if (normalizedAssignmentId) {
      const assignmentValidation = await validateAssignmentSubmission(
        normalizedAssignmentId,
        problemId,
        user.id,
        user.role
      );

      if (!assignmentValidation.ok) {
        return NextResponse.json(
          { error: assignmentValidation.error },
          { status: assignmentValidation.status }
        );
      }
    }

    const hasAccess = await canAccessProblem(problemId, user.id, user.role);

    if (!hasAccess) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const languageConfig = await db.query.languageConfigs.findFirst({
      where: and(
        eq(languageConfigs.language, language),
        eq(languageConfigs.isEnabled, true)
      ),
      columns: {
        id: true,
      },
    });

    if (!languageConfig) {
      return NextResponse.json({ error: "languageNotSupported" }, { status: 400 });
    }

    const id = generateSubmissionId();
    await db.insert(submissions).values({
      id,
      userId: user.id,
      problemId,
      language,
      sourceCode,
      assignmentId: normalizedAssignmentId,
      status: "pending",
      submittedAt: new Date(),
    });

    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
    });

    if (submission) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "submission.created",
        resourceType: "submission",
        resourceId: submission.id,
        resourceLabel: submission.id,
        summary: `Created submission ${submission.id} for "${problem.title}"`,
        details: {
          assignmentId: normalizedAssignmentId,
          language,
          problemId: problem.id,
          problemTitle: problem.title,
        },
        request,
      });
    }

    return NextResponse.json({ data: submission }, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/submissions error:", error);
    return NextResponse.json({ error: "submissionCreateFailed" }, { status: 500 });
  }
}
