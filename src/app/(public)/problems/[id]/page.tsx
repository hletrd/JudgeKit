import { redirect } from "next/navigation";

export default async function DashboardProblemRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ assignmentId?: string }>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(undefined),
  ]);

  const assignmentId = resolvedSearchParams?.assignmentId;
  const target = assignmentId
    ? `/practice/problems/${id}?assignmentId=${assignmentId}`
    : `/practice/problems/${id}`;

  redirect(target);
}
