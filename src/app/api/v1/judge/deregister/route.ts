import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db, execTransaction } from "@/lib/db";
import { judgeWorkers, submissions } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { isJudgeAuthorizedForWorker, hashToken } from "@/lib/judge/auth";
import { isJudgeIpAllowed } from "@/lib/judge/ip-allowlist";
import { safeTokenCompare } from "@/lib/security/timing";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { getDbNowUncached } from "@/lib/db-time";

const deregisterSchema = z.object({
  workerId: z.string().min(1),
  workerSecret: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    if (!isJudgeIpAllowed(request)) {
      return apiError("ipNotAllowed", 403);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("invalidJson", 400);
    }
    const parsed = deregisterSchema.safeParse(raw);
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
    if (!safeTokenCompare(hashToken(workerSecret), worker.secretTokenHash)) {
      return apiError("invalidWorkerSecret", 403);
    }

    const now = await getDbNowUncached();

    // Atomic: update worker to offline AND release all claimed submissions.
    // Prevents a partial-failure state where the worker is offline but
    // submissions remain claimed (which would stall them for up to the
    // stale-claim timeout).
    const releasedCount = await execTransaction(async (tx) => {
      const result = await tx
        .update(judgeWorkers)
        .set({
          status: "offline",
          deregisteredAt: now,
          activeTasks: 0,
        })
        .where(eq(judgeWorkers.id, workerId));

      if ((result.rowCount ?? 0) === 0) {
        throw new Error("workerNotFound");
      }

      // Find and release all submissions currently claimed by this worker
      const claimed = await tx
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
        await tx
          .update(submissions)
          .set({
            status: "pending",
            judgeClaimToken: null,
            judgeClaimedAt: null,
            judgeWorkerId: null,
          })
          .where(inArray(submissions.id, claimedIds));
      }

      return claimed.length;
    });

    logger.info(
      { workerId, releasedCount },
      "[judge/deregister] Worker deregistered and submissions released"
    );

    return apiSuccess({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "workerNotFound") {
      return apiError("workerNotFound", 404);
    }
    logger.error({ err: error }, "POST /api/v1/judge/deregister error");
    return apiError("internalServerError", 500);
  }
}
