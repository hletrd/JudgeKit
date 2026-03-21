import { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { judgeWorkers, submissions } from "@/lib/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden } from "@/lib/api/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const caps = await resolveCapabilities(user.role);
    if (!caps.has("system.settings")) return forbidden();

    const workerCounts = await db
      .select({
        status: judgeWorkers.status,
        count: sql<number>`count(*)`,
      })
      .from(judgeWorkers)
      .groupBy(judgeWorkers.status);

    const online = workerCounts.find((w) => w.status === "online")?.count ?? 0;
    const stale = workerCounts.find((w) => w.status === "stale")?.count ?? 0;
    const offline = workerCounts.find((w) => w.status === "offline")?.count ?? 0;

    const queueDepth = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(eq(submissions.status, "pending"))
      .then((rows) => rows[0]?.count ?? 0);

    const activeJudging = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(inArray(submissions.status, ["queued", "judging"]))
      .then((rows) => rows[0]?.count ?? 0);

    const totalConcurrency = await db
      .select({ total: sql<number>`coalesce(sum(${judgeWorkers.concurrency}), 0)` })
      .from(judgeWorkers)
      .where(eq(judgeWorkers.status, "online"))
      .then((rows) => rows[0]?.total ?? 0);

    return apiSuccess({
      workersOnline: online,
      workersStale: stale,
      workersOffline: offline,
      queueDepth,
      activeJudging,
      totalConcurrency,
    });
  } catch {
    return apiSuccess({
      workersOnline: 0,
      workersStale: 0,
      workersOffline: 0,
      queueDepth: 0,
      activeJudging: 0,
      totalConcurrency: 0,
    });
  }
}
