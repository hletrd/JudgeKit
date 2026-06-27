import { NextRequest, NextResponse } from "next/server";
import { createApiHandler, type HandlerContext } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { auditEvents, users, groups, assignments, submissions, problems } from "@/lib/db/schema";
import { and, desc, eq, gte, lte, or, sql, type SQL } from "drizzle-orm";
import { contentDispositionAttachment } from "@/lib/http/content-disposition";
import { escapeCsvField } from "@/lib/csv/escape-field";
import { parsePositiveInt } from "@/lib/validators/query-params";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { escapeLikePattern } from "@/lib/db/like";

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

/** Maximum rows returned by CSV exports to prevent memory exhaustion DoS. */
const MAX_CSV_EXPORT_ROWS = 10_000;

function buildGroupMemberScopeFilter(groupIds: string[]) {
  if (groupIds.length === 0) {
    return sql`0`;
  }

  return or(
    ...groupIds.map(
      (groupId) =>
        sql`(${auditEvents.details}::jsonb)->>'groupId' = ${groupId}`
    )
  );
}

function normalizeDateFilter(value?: string | null) {
  if (typeof value !== "string" || !value) return "";
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? "" : value;
}

export const GET = createApiHandler({
  auth: { capabilities: ["system.audit_logs"] },
  rateLimit: "audit-logs:export",
  handler: async (req: NextRequest, ctx: HandlerContext) => {
    const searchParams = req.nextUrl.searchParams;
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const limit = Math.min(100, parsePositiveInt(searchParams.get("limit"), 50));
    const resourceType = searchParams.get("resource") ?? undefined;
    const search = searchParams.get("search")?.trim().slice(0, 100) ?? "";
    const actorId = searchParams.get("actorId") ?? undefined;
    const action = searchParams.get("action") ?? undefined;
    const dateFrom = normalizeDateFilter(searchParams.get("dateFrom"));
    const dateTo = normalizeDateFilter(searchParams.get("dateTo"));
    const format = searchParams.get("format") ?? "json";

    const filters: SQL[] = [];

    // Instructor scope filtering: instructors only see audit events for
    // resources they own (groups, assignments, submissions, problems).
    const caps = await resolveCapabilities(ctx.user.role);
    const isAdminViewer = caps.has("users.edit");
    const isInstructorViewer = !isAdminViewer;

    if (isInstructorViewer) {
      // Instructor scope: only audit events for resources they own. Previously
      // this fanned out to 4 preparatory findMany round-trips and wide
      // `IN (id, id, ...)` lists built from the results. Restructured to
      // correlated `EXISTS` subqueries so the DB plans each scope in one
      // round-trip with per-table selectivity (AGG-41). Only the taught-group
      // id list is still fetched (one round-trip) because the `group_member`
      // scope is a JSONB `details->>'groupId' IN (...)` lookup that cannot be
      // expressed as a correlated EXISTS on a foreign key.
      //
      // The EXISTS predicates are always emitted for instructors (no
      // `length > 0` guards): an instructor who owns nothing now sees nothing
      // (fail-closed), whereas the prior IN-array form would push no filter at
      // all and let an empty-scope instructor see every event.
      const userId = ctx.user.id;
      const ownedGroups = await db.query.groups.findMany({
        where: (g, { eq: equals }) => equals(g.instructorId, userId),
        columns: { id: true },
      });
      const groupIds = ownedGroups.map((g) => g.id);

      const scopeFilters: SQL[] = [
        // group: directly taught.
        and(
          eq(auditEvents.resourceType, "group"),
          sql`EXISTS (SELECT 1 FROM ${groups} WHERE ${groups.id} = ${auditEvents.resourceId} AND ${groups.instructorId} = ${userId})`
        ),
        // assignment: taught via the owning group.
        and(
          eq(auditEvents.resourceType, "assignment"),
          sql`EXISTS (SELECT 1 FROM ${assignments} JOIN ${groups} ON ${groups.id} = ${assignments.groupId} WHERE ${assignments.id} = ${auditEvents.resourceId} AND ${groups.instructorId} = ${userId})`
        ),
        // submission: taught via the assignment's owning group.
        and(
          eq(auditEvents.resourceType, "submission"),
          sql`EXISTS (SELECT 1 FROM ${submissions} JOIN ${assignments} ON ${assignments.id} = ${submissions.assignmentId} JOIN ${groups} ON ${groups.id} = ${assignments.groupId} WHERE ${submissions.id} = ${auditEvents.resourceId} AND ${groups.instructorId} = ${userId})`
        ),
        // problem: authored by the instructor.
        and(
          eq(auditEvents.resourceType, "problem"),
          sql`EXISTS (SELECT 1 FROM ${problems} WHERE ${problems.id} = ${auditEvents.resourceId} AND ${problems.authorId} = ${userId})`
        ),
      ];

      // group_member: JSONB details->>'groupId' IN (taught group ids). Cannot
      // be a correlated EXISTS on a FK; keep the IN-array form for this single
      // scope. When the instructor teaches no groups, emit a fail-closed
      // predicate so the OR below does not silently broaden to "all events".
      if (groupIds.length > 0) {
        scopeFilters.push(
          and(
            eq(auditEvents.resourceType, "group_member"),
            buildGroupMemberScopeFilter(groupIds)
          )
        );
      }

      // OR of all scopes. Always non-empty (4 EXISTS predicates above), so an
      // instructor with zero owned resources resolves to OR(false, ...) →
      // false → sees nothing, fail-closed.
      const scopedInstructorFilter = or(...scopeFilters);
      if (scopedInstructorFilter) filters.push(scopedInstructorFilter);
    }

    if (resourceType && VALID_RESOURCE_TYPES.includes(resourceType as typeof VALID_RESOURCE_TYPES[number])) {
      filters.push(eq(auditEvents.resourceType, resourceType));
    }

    if (actorId) {
      filters.push(eq(auditEvents.actorId, actorId));
    }

    if (action && action !== "all") {
      filters.push(sql`${auditEvents.action} LIKE ${escapeLikePattern(action) + '%'} ESCAPE '\\'`);
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

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      filters.push(gte(auditEvents.createdAt, fromDate));
    }

    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setUTCHours(23, 59, 59, 999);
      filters.push(lte(auditEvents.createdAt, endOfDay));
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
    if (format === "csv") {
      // (createdAt desc, id desc) — total order so the CSV cap boundary is
      // deterministic for same-timestamp rows (RPF cycle-7 AGG7-2).
      const rows = await filteredQuery.orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(MAX_CSV_EXPORT_ROWS);
      const BOM = "\uFEFF";
      const header = [
        "Timestamp",
        "Action",
        "Resource Type",
        "Resource Label",
        "Resource ID",
        "Actor Role",
        "Actor Name",
        "Actor Username",
        "Summary",
        "Details",
        "IP Address",
        "Request Method",
        "Request Path",
        "User Agent",
      ]
        .map(escapeCsvField)
        .join(",");
      const csvRows = rows.map((row) =>
        [
          row.createdAt?.toISOString() ?? "",
          row.action,
          row.resourceType,
          row.resourceLabel ?? "",
          row.resourceId ?? "",
          row.actorRole ?? "",
          row.actorName ?? "",
          row.actorUsername ?? "",
          row.summary ?? "",
          row.details ?? "",
          row.ipAddress ?? "",
          row.requestMethod ?? "",
          row.requestPath ?? "",
          row.userAgent ?? "",
        ]
          .map(escapeCsvField)
          .join(",")
      );

      return new NextResponse(BOM + [header, ...csvRows].join("\r\n") + "\r\n", {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": contentDispositionAttachment("audit-logs", ".csv"),
        },
      });
    }

    const data = await filteredQuery
      // (createdAt desc, id desc) — total order so same-timestamp rows do not
      // shuffle across offset pages (RPF cycle-7 AGG7-2).
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
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
