import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { codeSnapshots } from "@/lib/db/schema";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";

const snapshotSchema = z.object({
  problemId: z.string().min(1),
  assignmentId: z.string().nullable().optional(),
  language: z.string().min(1),
  sourceCode: z.string(),
});

export const POST = createApiHandler({
  rateLimit: "code-snapshot",
  schema: snapshotSchema,
  handler: async (_req: NextRequest, { user, body }) => {
    await db.insert(codeSnapshots).values({
      userId: user.id,
      problemId: body.problemId,
      assignmentId: body.assignmentId ?? null,
      language: body.language,
      sourceCode: body.sourceCode,
      charCount: body.sourceCode.length,
    });

    return apiSuccess({ ok: true }, { status: 201 });
  },
});
