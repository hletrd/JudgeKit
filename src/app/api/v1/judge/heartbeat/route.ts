import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { judgeWorkers } from "@/lib/db/schema";
import { eq, lt, and } from "drizzle-orm";
import { isJudgeAuthorized } from "@/lib/judge/auth";
import { isJudgeIpAllowed } from "@/lib/judge/ip-allowlist";
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

    if (!isJudgeAuthorized(request)) {
      return apiError("unauthorized", 401);
    }

    const parsed = heartbeatSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "invalidRequest", 400);
    }

    const { workerId, workerSecret, activeTasks } = parsed.data;
    const now = new Date();

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
        lastHeartbeatAt: now,
        activeTasks,
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
