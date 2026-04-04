import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { judgeWorkers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isJudgeAuthorized } from "@/lib/judge/auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

const deregisterSchema = z.object({
  workerId: z.string().min(1),
  workerSecret: z.string().min(1),
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

    const { workerId, workerSecret } = parsed.data;

    // Validate per-worker secret (mandatory)
    const worker = await db.query.judgeWorkers.findFirst({
      where: eq(judgeWorkers.id, workerId),
      columns: { secretToken: true },
    });
    if (!worker) return apiError("workerNotFound", 404);
    if (!worker.secretToken) return apiError("workerSecretNotConfigured", 403);
    const a = Buffer.from(workerSecret);
    const b = Buffer.from(worker.secretToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return apiError("invalidWorkerSecret", 403);
    }

    const result = await db
      .update(judgeWorkers)
      .set({
        status: "offline",
        deregisteredAt: new Date(),
        activeTasks: 0,
      })
      .where(eq(judgeWorkers.id, workerId));

    if ((result.rowCount ?? 0) === 0) {
      return apiError("workerNotFound", 404);
    }

    logger.info({ workerId }, "[judge/deregister] Worker deregistered");

    return apiSuccess({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/judge/deregister error");
    return apiError("internalServerError", 500);
  }
}
