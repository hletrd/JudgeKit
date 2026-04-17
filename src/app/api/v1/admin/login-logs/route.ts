import { NextRequest, NextResponse } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { loginEvents, users } from "@/lib/db/schema";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";

const VALID_OUTCOMES = ["success", "invalid_credentials", "rate_limited", "policy_denied"] as const;

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
  auth: { capabilities: ["system.login_logs"] },
  handler: async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const page = Math.max(1, Math.floor(Number(searchParams.get("page") ?? "1")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "50") || 50));
    const outcome = searchParams.get("outcome") ?? undefined;
    const search = searchParams.get("search")?.trim().slice(0, 100) ?? "";
    const dateFrom = normalizeDateFilter(searchParams.get("dateFrom"));
    const dateTo = normalizeDateFilter(searchParams.get("dateTo"));
    const format = searchParams.get("format") ?? "json";

    const filters: SQL[] = [];

    if (outcome && VALID_OUTCOMES.includes(outcome as typeof VALID_OUTCOMES[number])) {
      filters.push(eq(loginEvents.outcome, outcome));
    }

    if (search) {
      const likePattern = `%${escapeLikePattern(search.toLowerCase())}%`;
      filters.push(sql`
        (
          lower(coalesce(${loginEvents.attemptedIdentifier}, '')) like ${likePattern} escape '\\'
          or lower(coalesce(${users.username}, '')) like ${likePattern} escape '\\'
          or lower(coalesce(${users.name}, '')) like ${likePattern} escape '\\'
          or lower(coalesce(${loginEvents.ipAddress}, '')) like ${likePattern} escape '\\'
        )
      `);
    }

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      filters.push(gte(loginEvents.createdAt, fromDate));
    }

    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      filters.push(lte(loginEvents.createdAt, endOfDay));
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const countQuery = db
      .select({ total: sql<number>`count(${loginEvents.id})` })
      .from(loginEvents)
      .leftJoin(users, eq(loginEvents.userId, users.id));
    const [{ total }] = whereClause ? await countQuery.where(whereClause) : await countQuery;
    const totalCount = Number(total ?? 0);

    const offset = (page - 1) * limit;

    const eventsQuery = db
      .select({
        id: loginEvents.id,
        outcome: loginEvents.outcome,
        attemptedIdentifier: loginEvents.attemptedIdentifier,
        ipAddress: loginEvents.ipAddress,
        userAgent: loginEvents.userAgent,
        createdAt: loginEvents.createdAt,
        userId: loginEvents.userId,
        userName: users.name,
        userUsername: users.username,
      })
      .from(loginEvents)
      .leftJoin(users, eq(loginEvents.userId, users.id));

    const filteredQuery = whereClause ? eventsQuery.where(whereClause) : eventsQuery;
    if (format === "csv") {
      const rows = await filteredQuery.orderBy(desc(loginEvents.createdAt));
      const BOM = "\uFEFF";
      const header = [
        "Timestamp",
        "Outcome",
        "Identifier",
        "Resolved User Name",
        "Resolved Username",
        "IP Address",
        "User Agent",
      ]
        .map(escapeCsvField)
        .join(",");
      const csvRows = rows.map((row) =>
        [
          row.createdAt?.toISOString() ?? "",
          row.outcome,
          row.attemptedIdentifier ?? "",
          row.userName ?? "",
          row.userUsername ?? "",
          row.ipAddress ?? "",
          row.userAgent ?? "",
        ]
          .map(escapeCsvField)
          .join(",")
      );

      return new NextResponse(BOM + [header, ...csvRows].join("\r\n") + "\r\n", {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="login-logs.csv"',
        },
      });
    }

    const data = await filteredQuery
      .orderBy(desc(loginEvents.createdAt))
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
