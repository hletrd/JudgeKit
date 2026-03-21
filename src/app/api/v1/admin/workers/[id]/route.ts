import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { judgeWorkers, submissions } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden } from "@/lib/api/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import { logger } from "@/lib/logger";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const caps = await resolveCapabilities(user.role);
    if (!caps.has("system.settings")) return forbidden();

    const { id } = await params;

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
      request,
    });

    logger.info(
      { workerId: id, hostname: worker.hostname, removedBy: user.id },
      "[admin/workers] Worker force-removed"
    );

    return apiSuccess({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "DELETE /api/v1/admin/workers/[id] error");
    return apiError("internalServerError", 500);
  }
}
