import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { judgeWorkers } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { forbidden } from "@/lib/api/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { createApiHandler } from "@/lib/api/handler";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("system.settings")) return forbidden();

    const workers = await db
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
      .orderBy(desc(judgeWorkers.registeredAt));

    return apiSuccess(workers);
  },
});
