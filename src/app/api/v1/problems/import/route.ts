import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess } from "@/lib/api/responses";
import { createApiHandler, forbidden } from "@/lib/api/handler";
import { createProblemWithTestCases } from "@/lib/problem-management";
import { resolveCapabilities } from "@/lib/capabilities/cache";

const problemImportSchema = z.object({
  version: z.number().optional(),
  problem: z.object({
    title: z.string().min(1).max(200),
    description: z.string().default(""),
    sequenceNumber: z.number().int().min(1).nullable().optional(),
    timeLimitMs: z.number().int().min(100).max(30000).default(1000),
    memoryLimitMb: z.number().int().min(16).max(1024).default(256),
    problemType: z.enum(["auto", "manual"]).default("auto"),
    visibility: z.enum(["public", "private", "hidden"]).default("private"),
    showCompileOutput: z.boolean().default(true),
    showDetailedResults: z.boolean().default(true),
    showRuntimeErrors: z.boolean().default(true),
    allowAiAssistant: z.boolean().default(true),
    comparisonMode: z.enum(["exact", "float"]).default("exact"),
    floatAbsoluteError: z.number().min(0).max(1).nullable().optional(),
    floatRelativeError: z.number().min(0).max(1).nullable().optional(),
    difficulty: z.number().min(0).max(10).nullable().optional(),
    tags: z.array(z.string().min(1).max(50)).max(20).default([]),
    testCases: z.array(z.object({
      input: z.string(),
      expectedOutput: z.string(),
      isVisible: z.boolean().default(false),
      sortOrder: z.number().int().optional(),
    })).default([]),
  }),
});

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
