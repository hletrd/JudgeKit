import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { judgeWorkers, submissions } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { isJudgeAuthorizedForWorker, hashToken } from "@/lib/judge/auth";
import { isJudgeIpAllowed } from "@/lib/judge/ip-allowlist";
import { logger } from "@/lib/logger";
import { z } from "zod";

const deregisterSchema = z.object({
  workerId: z.string().min(1),
  workerSecret: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    if (!isJudgeIpAllowed(request)) {
      return apiError("ipNotAllowed", 403);
    }

    const parsed = deregisterSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "invalidRequest", 400);
    }

    const { workerId, workerSecret } = parsed.data;

    const workerAuth = await isJudgeAuthorizedForWorker(request, workerId);
    if (!workerAuth.authorized) {
      return apiError(workerAuth.error ?? "unauthorized", 401);
    }

    // Validate per-worker secret (mandatory)
    const worker = await db.query.judgeWorkers.findFirst({
      where: eq(judgeWorkers.id, workerId),
      columns: { secretTokenHash: true },
    });
    if (!worker) return apiError("workerNotFound", 404);
    if (!worker.secretTokenHash) return apiError("workerSecretNotConfigured", 403);
    {
      const a = Buffer.from(hashToken(workerSecret));
      const b = Buffer.from(worker.secretTokenHash);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return apiError("invalidWorkerSecret", 403);
      }
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

    // Release all submissions claimed by this worker so they don't remain stuck
    try {
      // Find all submissions currently claimed by this worker
      const claimed = await db
        .select({ id: submissions.id })
        .from(submissions)
        .where(
          and(
            eq(submissions.judgeWorkerId, workerId),
            inArray(submissions.status, ["pending", "queued", "judging"])
          )
        );

      if (claimed.length > 0) {
        const claimedIds = claimed.map((s) => s.id);
        await db
          .update(submissions)
          .set({
            status: "pending",
            judgeClaimToken: null,
            judgeClaimedAt: null,
            judgeWorkerId: null,
          })
          .where(inArray(submissions.id, claimedIds));

        logger.info(
          { workerId, releasedCount: claimedIds.length },
          "[judge/deregister] Released claimed submissions"
        );
      }
    } catch (releaseErr) {
      logger.error(
        { err: releaseErr, workerId },
        "[judge/deregister] Failed to release claimed submissions"
      );
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/judge/deregister error");
    return apiError("internalServerError", 500);
  }
}
