import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageUsers, isInstructorOrAbove } from "@/lib/auth/role-helpers";
import { StudentDashboard } from "./_components/student-dashboard";
import { InstructorDashboard } from "./_components/instructor-dashboard";
import { AdminDashboard } from "./_components/admin-dashboard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("dashboard");

  const isAdminView = canManageUsers(session.user.role);
  const isInstructorView = session.user.role === "instructor";

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t("title")}</h2>

      {session.user.role === "student" && (
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
