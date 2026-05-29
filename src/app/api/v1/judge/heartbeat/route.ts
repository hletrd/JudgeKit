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
import { getDbNowUncached } from "@/lib/db-time";
import { getConfiguredSettings } from "@/lib/system-settings-config";
import {
  computeStaleStatusCutoff,
  computeActiveTasksResetCutoff,
} from "@/lib/judge/worker-staleness";

const heartbeatSchema = z.object({
  workerId: z.string().min(1),
  workerSecret: z.string().min(1),
  activeTasks: z.number().int().nonnegative(),
  availableSlots: z.number().int().nonnegative(),
  uptimeSeconds: z.number().nonnegative().optional(),
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
    const parsed = heartbeatSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "invalidRequest", 400);
    }

    // activeTasks is accepted in the request body for worker telemetry but is
    // intentionally NOT persisted here: claim/route.ts increments active_tasks
    // atomically in SQL and poll/route.ts decrements it. Overwriting it from
    // the worker's self-report would defeat that atomicity.
    const { workerId, workerSecret } = parsed.data;
    const now = await getDbNowUncached();

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
    const staleThreshold = computeStaleStatusCutoff(now);
    await db.update(judgeWorkers)
      .set({ status: "stale" })
      .where(
        and(
          eq(judgeWorkers.status, "online"),
          lt(judgeWorkers.lastHeartbeatAt, staleThreshold)
        )
      );

    // Reconcile active_tasks for workers that have been silent past the
    // stale-claim timeout (N1). At that point any submission they had claimed is
    // provably reclaimable by the claim CTE, so their active_tasks counter no
    // longer reflects real in-flight work. A worker that merely crossed the 90 s
    // stale threshold (transient blip) is intentionally NOT reset here, because
    // it may still be working and its next heartbeat flips it back to online —
    // zeroing it would corrupt a live counter. Without this, a SIGKILLed worker
    // that never deregisters would leak active_tasks forever, holding
    // admin-health in `degraded` (which trips on any stale > 0). The graceful
    // deregister / admin-DELETE paths already zero active_tasks; this closes the
    // crash path.
    const staleClaimTimeoutMs = getConfiguredSettings().staleClaimTimeoutMs;
    const activeTasksResetThreshold = computeActiveTasksResetCutoff(now, staleClaimTimeoutMs);
    await db.update(judgeWorkers)
      .set({ activeTasks: 0 })
      .where(
        and(
          lt(judgeWorkers.lastHeartbeatAt, activeTasksResetThreshold),
          // Only touch rows that still carry a phantom counter, and never a live
          // worker — `online` rows are excluded because a row only stays online
          // while heartbeating, but guard defensively against a row that flipped
          // back to online between the two updates above.
          eq(judgeWorkers.status, "stale")
        )
      );

    return apiSuccess({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/judge/heartbeat error");
    return apiError("internalServerError", 500);
  }
}
