import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { asc, sql } from "drizzle-orm";
import { getApiUser, unauthorized } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { logger } from "@/lib/logger";
import { escapeLikePattern } from "@/lib/db/like";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 100);

    const whereClause = query
      ? sql`${tags.name} LIKE ${`%${escapeLikePattern(query)}%`} ESCAPE '\\'`
      : undefined;

    const results = await db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .where(whereClause)
      .orderBy(asc(tags.name))
      .limit(limit);

    return apiSuccess(results);
  } catch (error) {
    logger.error({ err: error }, "GET /api/v1/tags error");
    return apiError("internalServerError", 500);
  }
}
