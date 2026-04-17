import { NextRequest, NextResponse } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { auditEvents, users } from "@/lib/db/schema";
import { and, desc, eq, gte, like, lte, sql, type SQL } from "drizzle-orm";

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

function normalizeDateFilter(value?: string | null) {
  if (typeof value !== "string" || !value) return "";
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? "" : value;
}

function escapeCsvField(value: string | number | null | undefined) {
  let str = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "\t" + str;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export const GET = createApiHandler({
  auth: { capabilities: ["system.audit_logs"] },
  handler: async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const page = Math.max(1, Math.floor(Number(searchParams.get("page") ?? "1")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "50") || 50));
    const resourceType = searchParams.get("resource") ?? undefined;
    const search = searchParams.get("search")?.trim().slice(0, 100) ?? "";
    const actorId = searchParams.get("actorId") ?? undefined;
    const action = searchParams.get("action") ?? undefined;
    const dateFrom = normalizeDateFilter(searchParams.get("dateFrom"));
    const dateTo = normalizeDateFilter(searchParams.get("dateTo"));
    const format = searchParams.get("format") ?? "json";

    const filters: SQL[] = [];

    if (resourceType && VALID_RESOURCE_TYPES.includes(resourceType as typeof VALID_RESOURCE_TYPES[number])) {
      filters.push(eq(auditEvents.resourceType, resourceType));
    }

    if (actorId) {
      filters.push(eq(auditEvents.actorId, actorId));
    }

    if (action && action !== "all") {
      filters.push(like(auditEvents.action, `${action}%`));
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
      const rows = await filteredQuery.orderBy(desc(auditEvents.createdAt));
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
          "Content-Disposition": 'attachment; filename="audit-logs.csv"',
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
