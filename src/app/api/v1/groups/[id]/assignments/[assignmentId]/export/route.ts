import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, groups } from "@/lib/db/schema";
import { getApiUser, unauthorized, forbidden, notFound, isAdmin, isInstructor } from "@/lib/api/auth";
import { getAssignmentStatusRows } from "@/lib/assignments/submissions";
import type { UserRole } from "@/types";

function escapeCsvField(value: string | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function buildCsvRow(fields: (string | null | undefined)[]): string {
  return fields.map(escapeCsvField).join(",");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id, assignmentId } = await params;

    if (!isInstructor(user.role)) {
      return forbidden();
    }

    const group = await db.query.groups.findFirst({
      where: eq(groups.id, id),
      columns: { id: true, instructorId: true },
    });

    if (!group) return notFound("Group");

    if (!isAdmin(user.role) && group.instructorId !== user.id) {
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

    const header = buildCsvRow([
      "Student Name",
      "Username",
      "Class",
      "Status",
      "Score",
      "Submitted At",
    ]);

    const dataRows = statusData.rows.map((row) => {
      const submittedAt = row.latestSubmittedAt
        ? row.latestSubmittedAt.toISOString()
        : "";
      const status = row.latestStatus ?? "";
      const score = String(row.bestTotalScore);

      return buildCsvRow([
        row.name,
        row.username,
        row.className,
        status,
        score,
        submittedAt,
      ]);
    });

    const csv = BOM + [header, ...dataRows].join("\r\n") + "\r\n";

    const safeTitle = assignment.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
    const filename = `assignment-${safeTitle}-grades.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/v1/groups/[id]/assignments/[assignmentId]/export error:", error);
    return NextResponse.json({ error: "exportFailed" }, { status: 500 });
  }
}
