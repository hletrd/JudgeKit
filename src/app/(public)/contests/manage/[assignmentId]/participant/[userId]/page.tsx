import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { getParticipantAuditData } from "@/lib/assignments/participant-audit";
import { getParticipantTimeline } from "@/lib/assignments/participant-timeline";
import { ParticipantTimelineView } from "@/components/contest/participant-timeline-view";
import { db } from "@/lib/db";
import { assignmentProblems, assignments, problems } from "@/lib/db/schema";

export default async function ParticipantAuditPage({
  params,
}: {
  params: Promise<{ assignmentId: string; userId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { assignmentId, userId } = await params;
  const canView = await canViewAssignmentSubmissions(
    assignmentId,
    session.user.id,
    session.user.role
  );
  if (!canView) {
    redirect(`/dashboard/contests/${assignmentId}`);
  }

  const [assignment, auditData, participantTimeline, assignmentProblemRows] =
    await Promise.all([
      db.query.assignments.findFirst({
        where: eq(assignments.id, assignmentId),
        columns: {
          id: true,
          title: true,
          examMode: true,
          enableAntiCheat: true,
        },
      }),
      getParticipantAuditData(assignmentId, userId),
      getParticipantTimeline(assignmentId, userId),
      db
        .select({
          problemId: assignmentProblems.problemId,
          title: problems.title,
          points: assignmentProblems.points,
          sortOrder: assignmentProblems.sortOrder,
        })
        .from(assignmentProblems)
        .innerJoin(problems, eq(problems.id, assignmentProblems.problemId))
        .where(eq(assignmentProblems.assignmentId, assignmentId))
        .orderBy(assignmentProblems.sortOrder, problems.title),
    ]);

  if (!assignment || assignment.examMode === "none" || !participantTimeline) {
    notFound();
  }

  return (
    <ParticipantTimelineView
      assignmentId={assignmentId}
      userId={userId}
      assignment={{
        title: assignment.title,
        enableAntiCheat: assignment.enableAntiCheat,
      }}
      assignmentProblems={assignmentProblemRows}
      auditData={auditData}
      participantTimeline={participantTimeline}
    />
  );
}
