import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { judgeWorkers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isJudgeAuthorizedForWorker, hashToken } from "@/lib/judge/auth";
import { isJudgeIpAllowed } from "@/lib/judge/ip-allowlist";
import { safeTokenCompare } from "@/lib/security/timing";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { getDbNowUncached } from "@/lib/db-time";
import { sweepStaleWorkers } from "@/lib/judge/worker-staleness-sweep";
import { getWarmPoolTargets } from "@/lib/judge/warm-pool-server";

// Per-process throttle for the inline (heartbeat-triggered) sweep. The
// background interval (instrumentation) is the primary scheduler; the inline
// path only tightens detection latency between its ticks.
const INLINE_SWEEP_MIN_INTERVAL_MS = 30_000;
let lastInlineSweepAtMs = 0;

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

    // Run the staleness sweep (online->stale, stale->offline+reap). Extracted to
    // worker-staleness-sweep so the SAME logic also runs on a background interval
    // (instrumentation), which is what reaps a dead single worker when no other
    // heartbeat would ever trigger this inline path. The sweep is idempotent, so
    // it runs fire-and-forget here: the heartbeat row update above has already
    // committed, and a transient sweep failure must not turn a successful
    // heartbeat into a 500 (a worker that re-registers on heartbeat failure
    // would accumulate duplicate rows). Throttled per process so a large fleet
    // heartbeating every 30s doesn't multiply the sweep write load.
    if (Date.now() - lastInlineSweepAtMs >= INLINE_SWEEP_MIN_INTERVAL_MS) {
      lastInlineSweepAtMs = Date.now();
      void sweepStaleWorkers(now).catch((err) => {
        logger.warn({ err }, "[judge] inline heartbeat staleness sweep failed");
      });
    }

    // Heartbeat is the steady-state config channel: an admin toggling the warm
    // pool reaches every worker within one heartbeat interval (~30s) with no
    // redeploy. getWarmPoolTargets fails closed to disabled targets.
    return apiSuccess({ ok: true, warmPool: await getWarmPoolTargets() });
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/judge/heartbeat error");
    return apiError("internalServerError", 500);
  }
}
