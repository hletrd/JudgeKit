import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { groups, enrollments, groupInstructors } from "@/lib/db/schema";
import { eq, desc, sql, or } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden, csrfForbidden } from "@/lib/api/auth";
import { recordAuditEvent } from "@/lib/audit/events";
import { parsePagination } from "@/lib/api/pagination";
import { apiError, apiPaginated, apiSuccess } from "@/lib/api/responses";
import { nanoid } from "nanoid";
import { createGroupSchema } from "@/lib/validators/groups";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { logger } from "@/lib/logger";
import { resolveCapabilities } from "@/lib/capabilities/cache";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();
    const caps = await resolveCapabilities(user.role);

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, offset } = parsePagination(searchParams, { defaultLimit: 25 });

    let results;
    let total = 0;

    if (caps.has("groups.view_all")) {
      const [totalRow] = await db.select({ count: sql<number>`count(*)` }).from(groups);
      total = Number(totalRow?.count ?? 0);
      results = await db.query.groups.findMany({
        orderBy: [desc(groups.createdAt)],
        limit,
        offset,
        with: {
          instructor: {
            columns: { id: true, name: true, email: true },
          },
        },
      });
    } else {
      const accessibleGroupFilter = or(
        eq(groups.instructorId, user.id),
        sql`exists (
          select 1
          from ${groupInstructors}
          where ${groupInstructors.groupId} = ${groups.id}
            and ${groupInstructors.userId} = ${user.id}
        )`,
        sql`exists (
          select 1
          from ${enrollments}
          where ${enrollments.groupId} = ${groups.id}
            and ${enrollments.userId} = ${user.id}
        )`
      );
      const [totalRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(groups)
        .where(accessibleGroupFilter);
      total = Number(totalRow?.count ?? 0);
      results = await db.query.groups.findMany({
        where: accessibleGroupFilter,
        orderBy: [desc(groups.createdAt)],
        limit,
        offset,
        with: {
          instructor: {
            columns: { id: true, name: true, email: true },
          },
        },
      });
    }

    return apiPaginated(results, page, limit, total);
  } catch (error) {
    logger.error({ err: error }, "GET /api/v1/groups error");
    return apiError("internalServerError", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const rateLimitResponse = await consumeApiRateLimit(request, "groups:create");
    if (rateLimitResponse) return rateLimitResponse;

    const user = await getApiUser(request);
    if (!user) return unauthorized();
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("groups.create")) return forbidden();

    const body = await request.json();
    const parsedInput = createGroupSchema.safeParse(body);

    if (!parsedInput.success) {
      return apiError(parsedInput.error.issues[0]?.message ?? "createError", 400);
    }

    const { name, description } = parsedInput.data;

    const id = nanoid();
    const [group] = await db.insert(groups).values({
      id,
      name,
      description: description || null,
      instructorId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    if (group) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "group.created",
        resourceType: "group",
        resourceId: group.id,
        resourceLabel: group.name,
        summary: `Created group \"${group.name}\"`,
        details: {
          isArchived: group.isArchived,
        },
        request,
      });
    }

    return apiSuccess(group, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/groups error");
    return apiError("createError", 500);
  }
}
