import { db } from "@/lib/db";
import { assignments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mapCompileError } from "@/lib/judge/function-judging/error-mapping";
import { functionPreludeLineCount } from "@/lib/judge/function-judging/assemble";
import { parseFunctionSpec } from "@/lib/judge/function-judging/types";
import { supportsFunctionJudging } from "@/lib/judge/function-judging/registry";
import { logger } from "@/lib/logger";

type SubmissionProblemVisibility = Record<string, unknown> | null | undefined;

type SubmissionTestCaseVisibility = Record<string, unknown> | null | undefined;

type SubmissionResultVisibility = Record<string, unknown>;

type SubmissionVisibilityRecord = Record<string, unknown> & {
  userId: string;
  assignmentId: string | null;
  language?: string;
  problem?: SubmissionProblemVisibility;
  results?: SubmissionResultVisibility[];
};

export function mapFunctionCompileOutputForDisplay(input: {
  compileOutput: string | null | undefined;
  language?: string | null;
  problem?: SubmissionProblemVisibility;
}): string | null {
  const { compileOutput, language, problem } = input;
  if (!compileOutput) return compileOutput ?? null;

  const problemType = problem?.problemType as string | null | undefined;
  const functionSpec = problem?.functionSpec;
  if (
    problemType !== "function" ||
    !functionSpec ||
    !language ||
    !supportsFunctionJudging(language)
  ) {
    return compileOutput;
  }

  try {
    const spec = parseFunctionSpec(functionSpec);
    const preludeLineCount = functionPreludeLineCount(spec, language);
    return mapCompileError(compileOutput, preludeLineCount);
  } catch (mappingErr) {
    // A malformed stored spec must not break the submission view; show the
    // raw (un-remapped) compile output rather than failing the read.
    logger.error(
      { err: mappingErr, language },
      "[submissions/visibility] Function compile-error remapping failed; showing raw output",
    );
    return compileOutput;
  }
}

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

/**
 * Sanitize a submission record for a given viewer, removing sensitive fields
 * based on the viewer's role, the problem's visibility settings, and the
 * assignment's result-display configuration.
 *
 * **Hidden DB query:** When `assignmentVisibility` is not provided and the
 * submission has an `assignmentId`, this function queries the `assignments`
 * table to determine `showResultsToCandidate` and `hideScoresFromCandidates`.
 * Callers that already have this data should pass it via `assignmentVisibility`
 * to avoid the extra DB query and prevent N+1 patterns in bulk contexts.
 */
export async function sanitizeSubmissionForViewer(
  submission: SubmissionVisibilityRecord,
  viewerId: string,
  capabilities: ReadonlySet<string>,
  assignmentVisibility?: { showResultsToCandidate?: boolean; hideScoresFromCandidates?: boolean }
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
    if (assignmentVisibility) {
      hideResults = !(assignmentVisibility.showResultsToCandidate ?? false);
      hideScores = assignmentVisibility.hideScoresFromCandidates ?? false;
    } else {
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
    sanitized.executionTimeMs = null;
    sanitized.memoryUsedKb = null;
    sanitized.score = null;
    sanitized.failedTestCaseIndex = null;
    // Compile error output and runtime error type describe the user's OWN
    // code, not the test-case expected output or score. Keeping them when
    // hideResults is on lets the submitter actually fix their broken code
    // — they could see the same information by re-running locally — while
    // still hiding everything that reveals the assignment's grading state
    // (per-test outputs, total score, failed test index). The
    // problem-level showCompileOutput / showRuntimeErrors gates were
    // already applied above and still take effect here.
    const status = typeof sanitized.status === "string" ? sanitized.status : null;
    if (status !== "compile_error") {
      sanitized.compileOutput = null;
    }
    if (status !== "runtime_error") {
      sanitized.runtimeErrorType = null;
    }
  } else if (hideScores) {
    sanitized.score = null;
  }

  if (!isOwner && !canViewSource) {
    delete sanitized.sourceCode;
  }

  sanitized.compileOutput = mapFunctionCompileOutputForDisplay({
    compileOutput: typeof sanitized.compileOutput === "string" ? sanitized.compileOutput : null,
    language: typeof submission.language === "string" ? submission.language : null,
    problem: submission.problem,
  });

  return sanitized;
}
