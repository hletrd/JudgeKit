import { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/responses";
import { createApiHandler, forbidden } from "@/lib/api/handler";
import { createProblemWithTestCases } from "@/lib/problem-management";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { problemImportSchema } from "@/lib/validators/problem-import";

export const POST = createApiHandler({
  rateLimit: "problems:create",
  schema: problemImportSchema,
  handler: async (_req: NextRequest, { user, body }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("problems.create")) return forbidden();

    const { problem } = body;

    const problemId = await createProblemWithTestCases(
      {
        title: problem.title,
        description: problem.description,
        sequenceNumber: problem.sequenceNumber ?? null,
        problemType: problem.problemType ?? "auto",
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
        visibility: problem.visibility,
        showCompileOutput: problem.showCompileOutput,
        showDetailedResults: problem.showDetailedResults,
        showRuntimeErrors: problem.showRuntimeErrors,
        allowAiAssistant: problem.allowAiAssistant,
        comparisonMode: problem.comparisonMode,
        floatAbsoluteError: problem.floatAbsoluteError ?? null,
        floatRelativeError: problem.floatRelativeError ?? null,
        difficulty: problem.difficulty ?? null,
        functionSpec: problem.problemType === "function" ? problem.functionSpec ?? null : null,
        referenceSolution: problem.problemType === "function" ? problem.referenceSolution ?? null : null,
        tags: problem.tags,
        testCases: problem.testCases.map((tc) => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          isVisible: tc.isVisible,
        })),
      },
      user.id
    );

    return apiSuccess({ id: problemId }, { status: 201 });
  },
});
