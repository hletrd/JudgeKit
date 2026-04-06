import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { judgeWorkers } from "@/lib/db/schema";
import { isJudgeAuthorized } from "@/lib/judge/auth";
import { extractClientIp } from "@/lib/security/ip";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { randomBytes } from "node:crypto";

const registerSchema = z.object({
  hostname: z.string().min(1).max(255),
  concurrency: z.number().int().min(1).max(64),
  version: z.string().max(64).optional(),
  labels: z.array(z.string().max(64)).max(32).optional(),
  cpuModel: z.string().max(255).optional(),
  architecture: z.string().max(64).optional(),
});

const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_CLAIM_TIMEOUT_MS = 300_000;

export async function POST(request: NextRequest) {
  try {
    if (!isJudgeAuthorized(request)) {
      return apiError("unauthorized", 401);
    }

    const parsed = registerSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "invalidRequest", 400);
    }

    const { hostname, concurrency, version, labels, cpuModel, architecture } = parsed.data;
    const ipAddress = extractClientIp(request.headers);
    const workerSecret = randomBytes(32).toString("hex");

    const [worker] = await db
      .insert(judgeWorkers)
      .values({
        hostname,
        ipAddress,
        concurrency,
        version: version ?? null,
        cpuModel: cpuModel ?? null,
        architecture: architecture ?? null,
        labels: labels ?? [],
        status: "online",
        secretToken: workerSecret,
      })
      .returning({ id: judgeWorkers.id });

    logger.info(
      { workerId: worker.id, hostname, concurrency, version },
      "[judge/register] Worker registered"
    );

    return apiSuccess({
      workerId: worker.id,
      workerSecret,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      staleClaimTimeoutMs: STALE_CLAIM_TIMEOUT_MS,
    });
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/judge/register error");
    return apiError("internalServerError", 500);
  }
}
