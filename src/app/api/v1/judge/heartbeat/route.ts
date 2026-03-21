import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { judgeWorkers } from "@/lib/db/schema";
import { eq, lt, and } from "drizzle-orm";
import { isJudgeAuthorized } from "@/lib/judge/auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

const heartbeatSchema = z.object({
  workerId: z.string().min(1),
  activeTasks: z.number().int().nonnegative(),
  availableSlots: z.number().int().nonnegative(),
  uptimeSeconds: z.number().nonnegative().optional(),
});

const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_MULTIPLIER = 3;

export async function POST(request: NextRequest) {
  try {
    if (!isJudgeAuthorized(request)) {
      return apiError("unauthorized", 401);
    }

    const parsed = heartbeatSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "invalidRequest", 400);
    }

    const { workerId, activeTasks } = parsed.data;
    const now = new Date();

    const result = db
      .update(judgeWorkers)
      .set({
        lastHeartbeatAt: now,
        activeTasks,
        status: "online",
      })
      .where(eq(judgeWorkers.id, workerId))
      .run();

    if (result.changes === 0) {
      return apiError("workerNotFound", 404);
    }

    // Piggyback staleness sweep: mark workers stale if heartbeat is too old
    const staleThreshold = new Date(
      Date.now() - HEARTBEAT_INTERVAL_MS * STALE_MULTIPLIER
    );
    db.update(judgeWorkers)
      .set({ status: "stale" })
      .where(
        and(
          eq(judgeWorkers.status, "online"),
          lt(judgeWorkers.lastHeartbeatAt, staleThreshold)
        )
      )
      .run();

    return apiSuccess({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/judge/heartbeat error");
    return apiError("internalServerError", 500);
  }
}
