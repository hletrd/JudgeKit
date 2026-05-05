import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignments } from "@/lib/db/schema";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { notFound, redirect } from "next/navigation";
import { AnalyticsCharts } from "@/components/contest/analytics-charts";
import { ExportButton } from "@/components/contest/export-button";

export default async function ContestAnalyticsPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [{ assignmentId }, t, tCommon] = await Promise.all([
    params,
    getTranslations("contests.analytics"),
    getTranslations("common"),
  ]);

  const role = session.user.role;

  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
    columns: { id: true, title: true, examMode: true },
  });

  if (!assignment || assignment.examMode === "none") {
    notFound();
  }

  const canView = await canViewAssignmentSubmissions(assignmentId, session.user.id, role);
  if (!canView) {
    redirect(`/contests/manage/${assignmentId}`);
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/contests/manage/${assignmentId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {tCommon("back")}
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">{t("title")}</h2>
          <p className="text-muted-foreground">{assignment.title}</p>
        </div>
        <ExportButton assignmentId={assignmentId} />
      </div>

      <AnalyticsCharts assignmentId={assignmentId} />
    </div>
  );
}
