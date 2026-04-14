import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { isInstructorOrAbove } from "@/lib/auth/role-helpers";
import { redirect } from "next/navigation";
import ProblemSetForm from "../_components/problem-set-form";
import {
  getAvailableGroupsForProblemSetUser,
  getAvailableProblemsForProblemSetUser,
} from "@/lib/problem-sets/visibility";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("problemSets");
  return { title: t("createTitle") };
}

export default async function NewProblemSetPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isInstructorOrAbove(session.user.role)) redirect("/dashboard");

  const [allProblems, allGroups] = await Promise.all([
    getAvailableProblemsForProblemSetUser(session.user.id, session.user.role),
    getAvailableGroupsForProblemSetUser(session.user.id, session.user.role),
  ]);

  return (
    <ProblemSetForm
      availableProblems={allProblems}
      availableGroups={allGroups}
    />
  );
}
