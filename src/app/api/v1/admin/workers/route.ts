import { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { judgeWorkers } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden } from "@/lib/api/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const caps = await resolveCapabilities(user.role);
    if (!caps.has("system.settings")) return forbidden();

    const workers = await db
      .select()
      .from(judgeWorkers)
      .orderBy(desc(judgeWorkers.registeredAt));

    return apiSuccess(workers);
  } catch {
    return apiSuccess([]);
  }
}
