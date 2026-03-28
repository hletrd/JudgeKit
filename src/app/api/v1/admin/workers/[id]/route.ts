import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { judgeWorkers, submissions } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { forbidden } from "@/lib/api/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { createApiHandler } from "@/lib/api/handler";

const updateWorkerSchema = z.object({
  alias: z.string().max(100).nullable().optional(),
});

export const PATCH = createApiHandler({
  schema: updateWorkerSchema,
  handler: async (req: NextRequest, { user, body, params }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("system.settings")) return forbidden();

    const { id } = params;

    const worker = await db.query.judgeWorkers.findFirst({
      where: eq(judgeWorkers.id, id),
    });

    if (!worker) {
      return apiError("workerNotFound", 404);
    }

    const updates: Record<string, unknown> = {};
    if (body.alias !== undefined) {
      updates.alias = body.alias;
    }

    if (Object.keys(updates).length > 0) {
      db.update(judgeWorkers).set(updates).where(eq(judgeWorkers.id, id)).run();
    }

    const updated = await db
      .select({
        id: judgeWorkers.id,
        hostname: judgeWorkers.hostname,
        alias: judgeWorkers.alias,
        ipAddress: judgeWorkers.ipAddress,
        concurrency: judgeWorkers.concurrency,
        activeTasks: judgeWorkers.activeTasks,
        version: judgeWorkers.version,
        labels: judgeWorkers.labels,
        status: judgeWorkers.status,
        registeredAt: judgeWorkers.registeredAt,
        lastHeartbeatAt: judgeWorkers.lastHeartbeatAt,
        deregisteredAt: judgeWorkers.deregisteredAt,
      })
      .from(judgeWorkers)
      .where(eq(judgeWorkers.id, id))
      .then((rows) => rows[0] ?? null);

    return apiSuccess(updated);
  },
});

export const DELETE = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("system.settings")) return forbidden();

    const { id } = params;

    const worker = await db.query.judgeWorkers.findFirst({
      where: eq(judgeWorkers.id, id),
    });

    if (!worker) {
      return apiError("workerNotFound", 404);
    }

    // Reclaim any in-flight submissions from this worker
    db.update(submissions)
      .set({
        status: "pending",
        judgeClaimToken: null,
        judgeClaimedAt: null,
        judgeWorkerId: null,
      })
      .where(
        and(
          eq(submissions.judgeWorkerId, id),
          inArray(submissions.status, ["queued", "judging"])
        )
      )
      .run();

    // Remove the worker record
    db.delete(judgeWorkers).where(eq(judgeWorkers.id, id)).run();

    recordAuditEvent({
      action: "judge_worker.force_removed",
      actorId: user.id,
      actorRole: user.role,
      resourceType: "judge_worker",
      resourceId: id,
      resourceLabel: worker.hostname,
      summary: `Force-removed judge worker ${worker.hostname} (${id})`,
      request: req,
    });

    logger.info(
      { workerId: id, hostname: worker.hostname, removedBy: user.id },
      "[admin/workers] Worker force-removed"
    );

    return apiSuccess({ ok: true });
  },
});
