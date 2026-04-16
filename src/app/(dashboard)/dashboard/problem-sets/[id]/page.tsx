import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { isInstructorOrAbove } from "@/lib/auth/role-helpers";
import { redirect, notFound } from "next/navigation";
import ProblemSetForm from "../_components/problem-set-form";
import {
  getAvailableGroupsForProblemSetUser,
  getAvailableProblemsForProblemSetUser,
  getVisibleProblemSetByIdForUser,
} from "@/lib/problem-sets/visibility";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("problemSets");
  return { title: t("editTitle") };
}

export default async function ProblemSetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isInstructorOrAbove(session.user.role)) redirect("/dashboard");

  const { id } = await params;

  const ps = await getVisibleProblemSetByIdForUser(id, session.user.id, session.user.role);

  if (!ps) notFound();

  const [allProblems, allGroups] = await Promise.all([
    getAvailableProblemsForProblemSetUser(session.user.id, session.user.role),
    getAvailableGroupsForProblemSetUser(session.user.id, session.user.role),
  ]);

  return (
    <ProblemSetForm
      problemSet={{
        id: ps.id,
        name: ps.name,
        description: ps.description ?? "",
        isPublic: ps.isPublic ?? false,
        problemIds: ps.problems
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map((p) => p.problemId),
        groupIds: ps.groupAccess.map((ga) => ga.groupId),
        assignedGroups: ps.groupAccess.map((ga) => ({
          id: ga.group.id,
          name: ga.group.name,
        })),
      }}
      availableProblems={allProblems}
      availableGroups={allGroups}
    />
  );
}
