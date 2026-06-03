import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { judgeWorkers } from "@/lib/db/schema";
import { isJudgeAuthorized, hashToken } from "@/lib/judge/auth";
import { isJudgeIpAllowed } from "@/lib/judge/ip-allowlist";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
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
    if (!isJudgeIpAllowed(request)) {
      return apiError("ipNotAllowed", 403);
    }

    if (!isJudgeAuthorized(request)) {
      return apiError("unauthorized", 401);
    }

    // Rate-limit registrations per client IP. Each successful register INSERTs a
    // new judge_workers row, so without this a holder of the shared judge token
    // (leaked CI/compose env, backup, compromised worker) could flood the table
    // with 'online' rows. Unlike claim, register has no per-worker identity yet,
    // so the limiter keys on IP.
    const rateLimitResponse = await consumeApiRateLimit(request, "judge:register");
    if (rateLimitResponse) return rateLimitResponse;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("invalidJson", 400);
    }
    const parsed = registerSchema.safeParse(raw);
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
        // Only the hash is persisted; the worker receives the plaintext
        // once in the response below.
        secretTokenHash: hashToken(workerSecret),
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
