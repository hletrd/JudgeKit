import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/responses";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, groups } from "@/lib/db/schema";
import { getApiUser, unauthorized, forbidden, notFound } from "@/lib/api/auth";
import { canManageGroupResourcesAsync } from "@/lib/assignments/management";
import { getAssignmentStatusRows } from "@/lib/assignments/submissions";
import { logger } from "@/lib/logger";
import { contentDispositionAttachment } from "@/lib/http/content-disposition";
import { escapeCsvField } from "@/lib/csv/escape-field";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id, assignmentId } = await params;

    const group = await db.query.groups.findFirst({
      where: eq(groups.id, id),
      columns: { id: true, instructorId: true },
    });

    if (!group) return notFound("Group");

    const canManage = await canManageGroupResourcesAsync(
      group.instructorId,
      user.id,
      user.role,
      id
    );

    if (!canManage) {
      return forbidden();
    }

    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, assignmentId),
      columns: { id: true, groupId: true, title: true },
    });

    if (!assignment || assignment.groupId !== id) {
      return notFound("Assignment");
    }

    const statusData = await getAssignmentStatusRows(assignmentId);

    if (!statusData) {
      return notFound("Assignment");
    }

    // BOM for Excel UTF-8 compatibility
    const BOM = "\uFEFF";

    const header = ["Student Name", "Username", "Class", "Status", "Score", "Submitted At"]
      .map(escapeCsvField)
      .join(",");

    const dataRows = statusData.rows.map((row) => {
      const submittedAt = row.latestSubmittedAt
        ? row.latestSubmittedAt.toISOString()
        : "";
      const status = row.latestStatus ?? "";
      const score = String(row.bestTotalScore);

      return [row.name, row.username, row.className, status, score, submittedAt]
        .map(escapeCsvField)
        .join(",");
    });

    const csv = BOM + [header, ...dataRows].join("\r\n") + "\r\n";

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDispositionAttachment(`assignment-${assignment.title}-grades`, ".csv"),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "GET /api/v1/groups/[id]/assignments/[assignmentId]/export error");
    return apiError("exportFailed", 500);
  }
}
