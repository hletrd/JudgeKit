import { db } from "@/lib/db";
import { assignments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type SubmissionProblemVisibility = Record<string, unknown> | null | undefined;

type SubmissionTestCaseVisibility = Record<string, unknown> | null | undefined;

type SubmissionResultVisibility = Record<string, unknown>;

type SubmissionVisibilityRecord = Record<string, unknown> & {
  userId: string;
  assignmentId: string | null;
  problem?: SubmissionProblemVisibility;
  results?: SubmissionResultVisibility[];
};

function sanitizeSubmissionResults(
  results: SubmissionResultVisibility[] | undefined,
  options: {
    canViewAllResults: boolean;
    showDetailedResults: boolean;
    showRuntimeErrors: boolean;
  }
) {
  if (!Array.isArray(results)) {
    return [] as SubmissionResultVisibility[];
  }

  return results.map((result) => {
    if (options.canViewAllResults) {
      return result;
    }

    const isVisible = Boolean(result.testCase && (result.testCase as SubmissionTestCaseVisibility)?.isVisible);
    const sanitized: SubmissionResultVisibility = { ...result };
    const status = typeof result.status === "string" ? result.status : null;

    if (!options.showDetailedResults) {
      sanitized.actualOutput = null;
      sanitized.executionTimeMs = null;
      sanitized.memoryUsedKb = null;
      return sanitized;
    }

    if (!isVisible) {
      sanitized.actualOutput = null;
    }

    if (!options.showRuntimeErrors && status === "runtime_error") {
      sanitized.actualOutput = null;
    }

    return sanitized;
  });
}

export async function sanitizeSubmissionForViewer(
  submission: SubmissionVisibilityRecord,
  viewerId: string,
  capabilities: ReadonlySet<string>
) {
  const isOwner = submission.userId === viewerId;
  const canViewSource = capabilities.has("submissions.view_source");
  const canViewAllResults = capabilities.has("submissions.view_all");
  const showCompileOutput = canViewAllResults || ((submission.problem?.showCompileOutput as boolean | null | undefined) ?? true);
  const showDetailedResults = canViewAllResults || ((submission.problem?.showDetailedResults as boolean | null | undefined) ?? true);
  const showRuntimeErrors = canViewAllResults || ((submission.problem?.showRuntimeErrors as boolean | null | undefined) ?? true);

  let hideResults = false;
  let hideScores = false;

  if (!canViewAllResults && submission.assignmentId) {
    const assignmentRow = await db.query.assignments.findFirst({
      where: eq(assignments.id, submission.assignmentId),
      columns: {
        showResultsToCandidate: true,
        hideScoresFromCandidates: true,
      },
    });

    hideResults = !(assignmentRow?.showResultsToCandidate ?? false);
    hideScores = assignmentRow?.hideScoresFromCandidates ?? false;
  }

  const sanitized: SubmissionVisibilityRecord = {
    ...submission,
    results: sanitizeSubmissionResults(submission.results, {
      canViewAllResults,
      showDetailedResults,
      showRuntimeErrors,
    }),
  };

  if (!showCompileOutput) {
    sanitized.compileOutput = null;
  }

  if (!showRuntimeErrors) {
    sanitized.runtimeErrorType = null;
  }

  if (hideResults) {
    sanitized.results = [];
    sanitized.compileOutput = null;
    sanitized.executionTimeMs = null;
    sanitized.memoryUsedKb = null;
    sanitized.score = null;
    sanitized.failedTestCaseIndex = null;
    sanitized.runtimeErrorType = null;
  } else if (hideScores) {
    sanitized.score = null;
  }

  if (!isOwner && !canViewSource) {
    delete sanitized.sourceCode;
  }

  return sanitized;
}
