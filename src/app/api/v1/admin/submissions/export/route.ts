import { NextRequest, NextResponse } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { getSubmissionReviewGroupIds } from "@/lib/assignments/submissions";
import { db } from "@/lib/db";
import { assignments, groups, problems, submissions, users } from "@/lib/db/schema";
import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";

const STATUS_FILTER_VALUES = [
  "pending",
  "queued",
  "judging",
  "accepted",
  "wrong_answer",
  "time_limit",
  "memory_limit",
  "runtime_error",
  "compile_error",
] as const;

function normalizeDateFilter(value?: string | null) {
  if (typeof value !== "string" || !value) return "";
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? "" : value;
}

function normalizeLanguageFilter(value?: string | null) {
  return typeof value === "string" ? value.trim().slice(0, 50) : "";
}

function normalizeStatusFilter(value: string | null) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return STATUS_FILTER_VALUES.includes(trimmed as (typeof STATUS_FILTER_VALUES)[number])
    ? (trimmed as (typeof STATUS_FILTER_VALUES)[number])
    : "";
}

function normalizeGroupFilter(value?: string | null) {
  return typeof value === "string" ? value.trim().slice(0, 64) : "";
}

import { escapeLikePattern } from "@/lib/db/like";
import { contentDispositionAttachment } from "@/lib/http/content-disposition";
import { escapeCsvField } from "@/lib/csv/escape-field";

export const GET = createApiHandler({
  auth: {
    capabilities: ["submissions.view_all", "assignments.view_status"],
    requireAllCapabilities: false,
  },
  handler: async (req: NextRequest, { user }) => {
    const searchParams = req.nextUrl.searchParams;
    const searchQuery = (searchParams.get("search") ?? "").trim().slice(0, 200);
    const statusFilter = normalizeStatusFilter(searchParams.get("status"));
    const groupFilter = normalizeGroupFilter(searchParams.get("group"));
    const languageFilter = normalizeLanguageFilter(searchParams.get("language"));
    const dateFrom = normalizeDateFilter(searchParams.get("dateFrom"));
    const dateTo = normalizeDateFilter(searchParams.get("dateTo"));

    const searchWhereClause = searchQuery
      ? or(
          sql`${users.name} LIKE ${`%${escapeLikePattern(searchQuery)}%`} ESCAPE '\\'`,
          sql`${problems.title} LIKE ${`%${escapeLikePattern(searchQuery)}%`} ESCAPE '\\'`
        )
      : undefined;

    const submissionReviewGroupIds = await getSubmissionReviewGroupIds(user.id, user.role);
    const scopedGroupFilter =
      submissionReviewGroupIds !== null
        ? submissionReviewGroupIds.length > 0
          ? inArray(assignments.groupId, submissionReviewGroupIds)
          : eq(assignments.id, "__no_access__")
        : undefined;

    const whereClause = and(
      scopedGroupFilter,
      statusFilter ? eq(submissions.status, statusFilter) : undefined,
      groupFilter ? eq(assignments.groupId, groupFilter) : undefined,
      languageFilter ? eq(submissions.language, languageFilter) : undefined,
      dateFrom ? gte(submissions.submittedAt, new Date(dateFrom)) : undefined,
      dateTo
        ? (() => {
            const endOfDay = new Date(dateTo);
            endOfDay.setHours(23, 59, 59, 999);
            return lte(submissions.submittedAt, endOfDay);
          })()
        : undefined,
      searchWhereClause
    );

    // Hard cap to prevent OOM on large deployments — matches the CSV-01 limit
    // applied to audit-logs and login-logs in cycle 2.
    const MAX_EXPORT_ROWS = 10_000;

    const rows = await db
      .select({
        id: submissions.id,
        language: submissions.language,
        status: submissions.status,
        submittedAt: submissions.submittedAt,
        score: submissions.score,
        userName: users.name,
        groupName: groups.name,
        problemTitle: problems.title,
      })
      .from(submissions)
      .leftJoin(assignments, eq(submissions.assignmentId, assignments.id))
      .leftJoin(groups, eq(assignments.groupId, groups.id))
      .leftJoin(users, eq(submissions.userId, users.id))
      .leftJoin(problems, eq(submissions.problemId, problems.id))
      .where(whereClause)
      .limit(MAX_EXPORT_ROWS);

    const BOM = "\uFEFF";
    const header = [
      "Submission ID",
      "User",
      "Group",
      "Problem",
      "Language",
      "Status",
      "Score",
      "Submitted At",
    ]
      .map(escapeCsvField)
      .join(",");
    const csvRows = rows.map((row) =>
      [
        row.id,
        row.userName ?? "",
        row.groupName ?? "",
        row.problemTitle ?? "",
        row.language,
        row.status,
        row.score ?? "",
        row.submittedAt?.toISOString() ?? "",
      ]
        .map(escapeCsvField)
        .join(",")
    );

    return new NextResponse(BOM + [header, ...csvRows].join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDispositionAttachment("submissions-export", ".csv"),
      },
    });
  },
});
