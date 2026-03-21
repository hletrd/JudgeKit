import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { judgeWorkers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isJudgeAuthorized } from "@/lib/judge/auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

const deregisterSchema = z.object({
  workerId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    if (!isJudgeAuthorized(request)) {
      return apiError("unauthorized", 401);
    }

    const parsed = deregisterSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "invalidRequest", 400);
    }

    const { workerId } = parsed.data;

    const result = db
      .update(judgeWorkers)
      .set({
        status: "offline",
        deregisteredAt: new Date(),
        activeTasks: 0,
      })
      .where(eq(judgeWorkers.id, workerId))
      .run();

    if (result.changes === 0) {
      return apiError("workerNotFound", 404);
    }

    logger.info({ workerId }, "[judge/deregister] Worker deregistered");

    return apiSuccess({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/judge/deregister error");
    return apiError("internalServerError", 500);
  }
}
