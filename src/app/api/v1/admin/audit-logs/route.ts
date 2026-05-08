import { NextRequest, NextResponse } from "next/server";
import { createApiHandler, type HandlerContext } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { auditEvents, users } from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
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
      const ownedGroups = await db.query.groups.findMany({
        where: (g, { eq: equals }) => equals(g.instructorId, ctx.user.id),
        columns: { id: true },
      });
      const groupIds = ownedGroups.map((g) => g.id);
      const assignmentIds =
        groupIds.length > 0
          ? (
              await db.query.assignments.findMany({
                where: (a, { inArray: inArrayOp }) => inArrayOp(a.groupId, groupIds),
                columns: { id: true },
              })
            ).map((a) => a.id)
          : [];
      const submissionIds =
        assignmentIds.length > 0
          ? (
              await db.query.submissions.findMany({
                where: (s, { inArray: inArrayOp }) => inArrayOp(s.assignmentId, assignmentIds),
                columns: { id: true },
              })
            ).map((s) => s.id)
          : [];
      const problemIds =
        groupIds.length > 0
          ? (
              await db.query.problems.findMany({
                where: (p, { eq: equals }) => equals(p.authorId, ctx.user.id),
                columns: { id: true },
              })
            ).map((p) => p.id)
          : [];

      const scopeFilters: SQL[] = [];

      if (groupIds.length > 0) {
        const groupScope = and(
          eq(auditEvents.resourceType, "group"),
          inArray(auditEvents.resourceId, groupIds)
        );
        const memberScope = and(
          eq(auditEvents.resourceType, "group_member"),
          buildGroupMemberScopeFilter(groupIds)
        );
        if (groupScope) scopeFilters.push(groupScope);
        if (memberScope) scopeFilters.push(memberScope);
      }

      if (assignmentIds.length > 0) {
        const assignmentScope = and(
          eq(auditEvents.resourceType, "assignment"),
          inArray(auditEvents.resourceId, assignmentIds)
        );
        if (assignmentScope) scopeFilters.push(assignmentScope);
      }

      if (submissionIds.length > 0) {
        const submissionScope = and(
          eq(auditEvents.resourceType, "submission"),
          inArray(auditEvents.resourceId, submissionIds)
        );
        if (submissionScope) scopeFilters.push(submissionScope);
      }

      if (problemIds.length > 0) {
        const problemScope = and(
          eq(auditEvents.resourceType, "problem"),
          inArray(auditEvents.resourceId, problemIds)
        );
        if (problemScope) scopeFilters.push(problemScope);
      }

      const scopedInstructorFilter = scopeFilters.length > 0 ? or(...scopeFilters) : sql`0`;
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
      endOfDay.setHours(23, 59, 59, 999);
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
      const rows = await filteredQuery.orderBy(desc(auditEvents.createdAt)).limit(MAX_CSV_EXPORT_ROWS);
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
