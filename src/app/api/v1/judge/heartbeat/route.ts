import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { judgeWorkers } from "@/lib/db/schema";
import { eq, lt, and } from "drizzle-orm";
import { isJudgeAuthorizedForWorker, hashToken } from "@/lib/judge/auth";
import { isJudgeIpAllowed } from "@/lib/judge/ip-allowlist";
import { safeTokenCompare } from "@/lib/security/timing";
import { logger } from "@/lib/logger";
import { z } from "zod";

const heartbeatSchema = z.object({
  workerId: z.string().min(1),
  workerSecret: z.string().min(1),
  activeTasks: z.number().int().nonnegative(),
  availableSlots: z.number().int().nonnegative(),
  uptimeSeconds: z.number().nonnegative().optional(),
});

const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_MULTIPLIER = 3;

export async function POST(request: NextRequest) {
  try {
    if (!isJudgeIpAllowed(request)) {
      return apiError("ipNotAllowed", 403);
    }

    const parsed = heartbeatSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "invalidRequest", 400);
    }

    // activeTasks is accepted in the request body for worker telemetry but is
    // intentionally NOT persisted here: claim/route.ts increments active_tasks
    // atomically in SQL and poll/route.ts decrements it. Overwriting it from
    // the worker's self-report would defeat that atomicity.
    const { workerId, workerSecret } = parsed.data;
    const now = new Date();

    const workerAuth = await isJudgeAuthorizedForWorker(request, workerId);
    if (!workerAuth.authorized) {
      return apiError(workerAuth.error ?? "unauthorized", 401);
    }

    // Validate per-worker secret against stored hash (mirrors deregister).
    // The plaintext secretToken column is deprecated and no longer trusted here.
    const worker = await db.query.judgeWorkers.findFirst({
      where: eq(judgeWorkers.id, workerId),
      columns: { secretTokenHash: true },
    });
    if (!worker) return apiError("workerNotFound", 404);
    if (!worker.secretTokenHash) return apiError("workerSecretNotConfigured", 403);
    if (!safeTokenCompare(hashToken(workerSecret), worker.secretTokenHash)) {
      return apiError("invalidWorkerSecret", 403);
    }

    const result = await db
      .update(judgeWorkers)
      .set({
        lastHeartbeatAt: now,
        status: "online",
      })
      .where(eq(judgeWorkers.id, workerId));

    if ((result.rowCount ?? 0) === 0) {
      return apiError("workerNotFound", 404);
    }

    // Piggyback staleness sweep: mark workers stale if heartbeat is too old.
    // Awaiting prevents the sweep from racing with another worker's heartbeat.
    const staleThreshold = new Date(
      Date.now() - HEARTBEAT_INTERVAL_MS * STALE_MULTIPLIER
    );
    await db.update(judgeWorkers)
      .set({ status: "stale" })
      .where(
        and(
          eq(judgeWorkers.status, "online"),
          lt(judgeWorkers.lastHeartbeatAt, staleThreshold)
        )
      );

    return apiSuccess({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/judge/heartbeat error");
    return apiError("internalServerError", 500);
  }
}
