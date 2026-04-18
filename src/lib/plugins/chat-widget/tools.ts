import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { problems, submissions, submissionResults, assignments } from "@/lib/db/schema";
import { canAccessProblem, canAccessGroup } from "@/lib/auth/permissions";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AgentContext {
  userId: string;
  userRole: string;
  problemId?: string;
  assignmentId?: string;
  editorCode?: string;
  editorLanguage?: string;
}

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "get_problem_description",
    description: "Get the problem title and full description (markdown). Call this first to understand what the student is working on.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_submission_history",
    description: "Get the student's recent submissions for this problem, including status, language, and execution time.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max submissions to return (default 5, max 10)" },
      },
      required: [],
    },
  },
  {
    name: "get_submission_detail",
    description: "Get detailed results of a specific submission including compile output, test case results, and runtime errors (if visible).",
    parameters: {
      type: "object",
      properties: {
        submissionId: { type: "string", description: "The submission ID to inspect" },
      },
      required: ["submissionId"],
    },
  },
  {
    name: "get_current_code",
    description: "Get the code currently in the student's editor along with the selected programming language.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_assignment_info",
    description: "Get assignment details (title, deadlines) if this problem is accessed through an assignment.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

export async function executeTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  context: AgentContext
): Promise<string> {
  switch (toolName) {
    case "get_problem_description":
      return handleGetProblemDescription(context);
    case "get_submission_history":
      return handleGetSubmissionHistory(context, toolArgs);
    case "get_submission_detail":
      return handleGetSubmissionDetail(context, toolArgs);
    case "get_current_code":
      return handleGetCurrentCode(context);
    case "get_assignment_info":
      return handleGetAssignmentInfo(context);
    default:
      return JSON.stringify({ error: "Unknown tool" });
  }
}

async function handleGetProblemDescription(context: AgentContext): Promise<string> {
  if (!context.problemId) {
    return JSON.stringify({ error: "No problem context available" });
  }

  const hasAccess = await canAccessProblem(context.problemId, context.userId, context.userRole);
  if (!hasAccess) {
    return JSON.stringify({ error: "Access denied" });
  }

  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, context.problemId),
    columns: {
      title: true,
      description: true,
      timeLimitMs: true,
      memoryLimitMb: true,
    },
  });

  if (!problem) {
    return JSON.stringify({ error: "Problem not found" });
  }

  return JSON.stringify({
    title: problem.title,
    description: problem.description || "(No description)",
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
  });
}

async function handleGetSubmissionHistory(
  context: AgentContext,
  args: Record<string, unknown>
): Promise<string> {
  if (!context.problemId) {
    return JSON.stringify({ error: "No problem context available" });
  }

  const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);

  const recentSubmissions = await db.query.submissions.findMany({
    where: (s, { and: andOp, eq: eqOp }) => {
      const filters = [eqOp(s.userId, context.userId), eqOp(s.problemId, context.problemId!)];
      if (context.assignmentId) {
        filters.push(eqOp(s.assignmentId, context.assignmentId));
      }
      return andOp(...filters);
    },
    orderBy: [desc(submissions.submittedAt)],
    limit,
    columns: {
      id: true,
      status: true,
      language: true,
      executionTimeMs: true,
      memoryUsedKb: true,
      submittedAt: true,
    },
  });

  return JSON.stringify({
    submissions: recentSubmissions.map((s) => ({
      id: s.id,
      status: s.status,
      language: s.language,
      executionTimeMs: s.executionTimeMs,
      memoryUsedKb: s.memoryUsedKb,
      submittedAt: s.submittedAt,
    })),
  });
}

async function handleGetSubmissionDetail(
  context: AgentContext,
  args: Record<string, unknown>
): Promise<string> {
  const submissionId = String(args.submissionId ?? "");
  if (!submissionId) {
    return JSON.stringify({ error: "submissionId is required" });
  }

  // Scope to the user's own submissions in the chat widget context.
  // Instructors should use the full submission detail page for cross-group review.
  const submission = await db.query.submissions.findFirst({
    where: (s, { and: andOp, eq: eqOp }) =>
      andOp(eqOp(s.id, submissionId), eqOp(s.userId, context.userId)),
    columns: {
      id: true,
      status: true,
      language: true,
      sourceCode: true,
      compileOutput: true,
      executionTimeMs: true,
      memoryUsedKb: true,
      problemId: true,
      runtimeErrorType: true,
    },
  });

  if (!submission) {
    return JSON.stringify({ error: "Submission not found or access denied" });
  }

  // Get problem settings to check visibility flags
  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, submission.problemId),
    columns: {
      showCompileOutput: true,
      showDetailedResults: true,
      showRuntimeErrors: true,
    },
  });

  const result: Record<string, unknown> = {
    id: submission.id,
    status: submission.status,
    language: submission.language,
    executionTimeMs: submission.executionTimeMs,
    memoryUsedKb: submission.memoryUsedKb,
  };

  // Always include the student's own source code
  result.sourceCode = submission.sourceCode;

  // Include compileOutput always, but note when hidden
  if (submission.compileOutput) {
    if (problem?.showCompileOutput) {
      result.compileOutput = submission.compileOutput;
    } else {
      result.compileOutput = "(Compile output is hidden for this problem)";
    }
  }

  // Respect showRuntimeErrors visibility flag
  if (problem?.showRuntimeErrors && submission.runtimeErrorType) {
    result.runtimeErrorType = submission.runtimeErrorType;
  }

  if (problem?.showDetailedResults) {
    const results = await db.query.submissionResults.findMany({
      where: eq(submissionResults.submissionId, submissionId),
      columns: {
        status: true,
        executionTimeMs: true,
        memoryUsedKb: true,
      },
      with: {
        testCase: {
          columns: { sortOrder: true, isVisible: true },
        },
      },
    });

    result.testResults = results
      .sort((a, b) => (a.testCase?.sortOrder ?? 0) - (b.testCase?.sortOrder ?? 0))
      .map((r) => ({
        status: r.status,
        executionTimeMs: r.executionTimeMs,
        memoryUsedKb: r.memoryUsedKb,
      }));
  }

  return JSON.stringify(result);
}

function handleGetCurrentCode(context: AgentContext): string {
  if (!context.editorCode) {
    return JSON.stringify({ info: "No code currently in the editor" });
  }

  return JSON.stringify({
    code: context.editorCode,
    language: context.editorLanguage || "unknown",
  });
}

async function handleGetAssignmentInfo(context: AgentContext): Promise<string> {
  if (!context.assignmentId) {
    return JSON.stringify({ info: "This problem is not accessed through an assignment" });
  }

  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, context.assignmentId),
    columns: {
      id: true,
      groupId: true,
      title: true,
      deadline: true,
      lateDeadline: true,
    },
  });

  if (!assignment) {
    return JSON.stringify({ error: "Assignment not found" });
  }

  const canViewPrivileged = await canViewAssignmentSubmissions(
    context.assignmentId,
    context.userId,
    context.userRole
  );
  const recruitingAccess = await getRecruitingAccessContext(context.userId);
  const hasAssignmentScopedRecruitingAccess = recruitingAccess.assignmentIds.includes(
    context.assignmentId
  );
  const hasGroupAccess =
    hasAssignmentScopedRecruitingAccess ||
    (await canAccessGroup(assignment.groupId, context.userId, context.userRole));

  if (!canViewPrivileged && !hasGroupAccess) {
    return JSON.stringify({ error: "Assignment not found or access denied" });
  }

  return JSON.stringify({
    title: assignment.title,
    deadline: assignment.deadline,
    lateDeadline: assignment.lateDeadline,
  });
}
