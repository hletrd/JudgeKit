import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { StudentDashboard } from "./_components/student-dashboard";
import { InstructorDashboard } from "./_components/instructor-dashboard";
import { AdminDashboard } from "./_components/admin-dashboard";
import { CandidateDashboard } from "./_components/candidate-dashboard";
import { DashboardJudgeSystemSection } from "./_components/dashboard-judge-system-section";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("dashboard");
  const caps = await resolveCapabilities(session.user.role);
  const accessContext = await getRecruitingAccessContext(session.user.id);
  const platformMode = accessContext.effectivePlatformMode;
  const canReviewAssignments = caps.has("submissions.view_all") || caps.has("assignments.view_status");
  const capabilityList = [...caps];
  const hasAdminWorkspace =
    caps.has("system.settings")
    || caps.has("users.view")
    || caps.has("users.manage_roles")
    || caps.has("system.audit_logs")
    || caps.has("system.login_logs")
    || caps.has("system.chat_logs")
    || caps.has("system.plugins")
    || caps.has("files.manage");

  const isAdminView = hasAdminWorkspace;
  const isInstructorView = canReviewAssignments && !hasAdminWorkspace;
  const isCandidateView = platformMode === "recruiting" && !canReviewAssignments && !hasAdminWorkspace;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t("title")}</h2>

      {!canReviewAssignments && !isCandidateView && !isAdminView && (
        <Suspense
          fallback={
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            </div>
          }
        >
          <StudentDashboard userId={session.user.id} />
        </Suspense>
      )}

      {isCandidateView && (
        <Suspense
          fallback={
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
              <Skeleton className="h-64 w-full" />
            </div>
          }
        >
          <CandidateDashboard
            userId={session.user.id}
            role={session.user.role}
            assignmentIds={accessContext.assignmentIds}
          />
        </Suspense>
      )}

      {isInstructorView && (
        <Suspense
          fallback={
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
              <Skeleton className="h-64 w-full" />
            </div>
          }
        >
          <InstructorDashboard userId={session.user.id} capabilities={capabilityList} />
        </Suspense>
      )}

      {isAdminView && (
        <Suspense
          fallback={
            <div className="space-y-6">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          }
        >
          <AdminDashboard capabilities={capabilityList} />
        </Suspense>
      )}

      {!isAdminView && !isCandidateView && (
        <Suspense
          fallback={
            <div className="space-y-4">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-64 w-full" />
            </div>
          }
        >
          <DashboardJudgeSystemSection />
        </Suspense>
      )}
    </div>
  );
}
