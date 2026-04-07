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
import { getRecruitingAccessContext } from "@/lib/recruiting/access";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("dashboard");
  const caps = await resolveCapabilities(session.user.role);
  const accessContext = await getRecruitingAccessContext(session.user.id);
  const platformMode = accessContext.effectivePlatformMode;

  const isAdminView = caps.has("system.settings");
  const isInstructorView = caps.has("submissions.view_all") && !caps.has("system.settings");
  const isCandidateView = platformMode === "recruiting" && !caps.has("submissions.view_all");

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t("title")}</h2>

      {!caps.has("submissions.view_all") && !isCandidateView && (
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
          <InstructorDashboard userId={session.user.id} />
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
          <AdminDashboard />
        </Suspense>
      )}
    </div>
  );
}
