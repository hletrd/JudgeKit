import { NextRequest } from "next/server";
import { createApiHandler, isAdmin } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { auditEvents, users } from "@/lib/db/schema";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";

const VALID_RESOURCE_TYPES = [
  "system_settings",
  "user",
  "problem",
  "group",
  "group_member",
  "assignment",
  "submission",
  "api_key",
  "role",
  "tag",
  "language_config",
  "plugin",
] as const;

function escapeLikePattern(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const searchParams = req.nextUrl.searchParams;
    const page = Math.max(1, Math.floor(Number(searchParams.get("page") ?? "1")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "50") || 50));
    const resourceType = searchParams.get("resource") ?? undefined;
    const search = searchParams.get("search")?.trim().slice(0, 100) ?? "";
    const actorId = searchParams.get("actorId") ?? undefined;

    const filters: SQL[] = [];

    if (resourceType && VALID_RESOURCE_TYPES.includes(resourceType as typeof VALID_RESOURCE_TYPES[number])) {
      filters.push(eq(auditEvents.resourceType, resourceType));
    }

    if (actorId) {
      filters.push(eq(auditEvents.actorId, actorId));
    }

    if (search) {
      const likePattern = `%${escapeLikePattern(search.toLowerCase())}%`;
      filters.push(sql`
        (
          lower(coalesce(${auditEvents.action}, '')) like ${likePattern} escape '\\'
          or lower(coalesce(${auditEvents.resourceId}, '')) like ${likePattern} escape '\\'
          or lower(coalesce(${auditEvents.resourceLabel}, '')) like ${likePattern} escape '\\'
          or lower(coalesce(${auditEvents.summary}, '')) like ${likePattern} escape '\\'
        )
      `);
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const countQuery = db
      .select({ total: sql<number>`count(${auditEvents.id})` })
      .from(auditEvents);
    const [{ total }] = whereClause ? await countQuery.where(whereClause) : await countQuery;
    const totalCount = Number(total ?? 0);

    const offset = (page - 1) * limit;

    const eventsQuery = db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        resourceType: auditEvents.resourceType,
        resourceId: auditEvents.resourceId,
        resourceLabel: auditEvents.resourceLabel,
        summary: auditEvents.summary,
        details: auditEvents.details,
        ipAddress: auditEvents.ipAddress,
        requestMethod: auditEvents.requestMethod,
        requestPath: auditEvents.requestPath,
        userAgent: auditEvents.userAgent,
        createdAt: auditEvents.createdAt,
        actorId: auditEvents.actorId,
        actorRole: auditEvents.actorRole,
        actorName: users.name,
        actorUsername: users.username,
      })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.actorId, users.id));

    const filteredQuery = whereClause ? eventsQuery.where(whereClause) : eventsQuery;
    const data = await filteredQuery
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit)
      .offset(offset);

    return apiSuccess({
      data,
      page,
      limit,
      total: totalCount,
    });
  },
});
