import { getTranslations } from "next-intl/server";
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { problems, submissions, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getAccessibleProblemIds } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type ProblemProgress = "solved" | "attempted" | "untried";
type ProblemFilter = "all" | "solved" | "unsolved" | "attempted";

const FILTER_VALUES: readonly ProblemFilter[] = ["all", "solved", "unsolved", "attempted"];

function getProblemProgress(statuses: Array<string | null>): ProblemProgress {
  if (statuses.some((status) => status === "accepted")) {
    return "solved";
  }

  if (statuses.length > 0) {
    return "attempted";
  }

  return "untried";
}

export default async function ProblemsPage({
  searchParams,
}: {
  searchParams?: Promise<{ progress?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawFilter = resolvedSearchParams?.progress;
  const currentFilter = FILTER_VALUES.includes(rawFilter as ProblemFilter)
    ? (rawFilter as ProblemFilter)
    : "all";

  const t = await getTranslations("problems");
  const tCommon = await getTranslations("common");
  const visibilityLabels = {
    public: t("visibilityOptions.public"),
    private: t("visibilityOptions.private"),
    hidden: t("visibilityOptions.hidden"),
  };
  const canManageProblems =
    session.user.role === "admin" ||
    session.user.role === "super_admin" ||
    session.user.role === "instructor";

  const allProblems = await db
    .select({
      id: problems.id,
      title: problems.title,
      timeLimitMs: problems.timeLimitMs,
      memoryLimitMb: problems.memoryLimitMb,
      visibility: problems.visibility,
      authorId: problems.authorId,
      createdAt: problems.createdAt,
      author: {
        name: users.name,
      },
    })
    .from(problems)
    .leftJoin(users, eq(problems.authorId, users.id))
    .orderBy(desc(problems.createdAt));

  let accessibleProblems: typeof allProblems;
  if (canManageProblems) {
    accessibleProblems = allProblems;
  } else {
    const accessibleIds = await getAccessibleProblemIds(
      session.user.id,
      session.user.role,
      allProblems.map((p) => ({
        id: p.id,
        visibility: p.visibility ?? "private",
        authorId: p.authorId,
      }))
    );
    accessibleProblems = allProblems.filter((p) => accessibleIds.has(p.id));
  }

  const userSubmissionRows = await db
    .select({
      problemId: submissions.problemId,
      status: submissions.status,
    })
    .from(submissions)
    .where(eq(submissions.userId, session.user.id));

  const problemStatuses = new Map<string, Array<string | null>>();
  for (const submission of userSubmissionRows) {
    const currentStatuses = problemStatuses.get(submission.problemId) ?? [];
    currentStatuses.push(submission.status);
    problemStatuses.set(submission.problemId, currentStatuses);
  }

  const problemsWithProgress = accessibleProblems.map((problem) => ({
    ...problem,
    progress: getProblemProgress(problemStatuses.get(problem.id) ?? []),
  }));

  const filteredProblems = problemsWithProgress.filter((problem) => {
    if (currentFilter === "all") {
      return true;
    }

    if (currentFilter === "solved") {
      return problem.progress === "solved";
    }

    if (currentFilter === "attempted") {
      return problem.progress === "attempted";
    }

    return problem.progress !== "solved";
  });

  const progressLabels = {
    solved: t("progress.solved"),
    attempted: t("progress.attempted"),
    untried: t("progress.untried"),
  };
  const filterLabels = {
    all: t("filters.all"),
    solved: t("filters.solved"),
    unsolved: t("filters.unsolved"),
    attempted: t("filters.attempted"),
  };

  function renderProgress(problemProgress: ProblemProgress) {
    if (problemProgress === "solved") {
      return (
        <span className="inline-flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="size-4" />
          {progressLabels.solved}
        </span>
      );
    }

    if (problemProgress === "attempted") {
      return (
        <span className="inline-flex items-center gap-2 text-amber-600">
          <XCircle className="size-4" />
          {progressLabels.attempted}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <CircleDashed className="size-4" />
        {progressLabels.untried}
      </span>
    );
  }

  function getFilterHref(filter: ProblemFilter) {
    return filter === "all" ? "/dashboard/problems" : `/dashboard/problems?progress=${filter}`;
  }

  return (
    <div className="space-y-4">
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        {canManageProblems && (
          <Link href="/dashboard/problems/create">
            <Button>{t("create")}</Button>
          </Link>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("available")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            {FILTER_VALUES.map((filter) => (
              <Link key={filter} href={getFilterHref(filter)}>
                <Button variant={currentFilter === filter ? "default" : "outline"} size="sm">
                  {filterLabels[filter]}
                </Button>
              </Link>
            ))}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.title")}</TableHead>
                <TableHead>{t("table.progress")}</TableHead>
                <TableHead>{t("table.author")}</TableHead>
                <TableHead>{t("table.timeLimit")}</TableHead>
                <TableHead>{t("table.memoryLimit")}</TableHead>
                <TableHead>{t("table.visibility")}</TableHead>
                <TableHead>{t("table.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProblems.map((problem) => (
                <TableRow key={problem.id}>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/problems/${problem.id}`} className="text-primary hover:underline">
                      {problem.title}
                    </Link>
                  </TableCell>
                  <TableCell>{renderProgress(problem.progress)}</TableCell>
                  <TableCell>{problem.author?.name || tCommon("system")}</TableCell>
                  <TableCell>{t("timeLimitValue", { value: problem.timeLimitMs ?? 2000 })}</TableCell>
                  <TableCell>{t("memoryLimitValue", { value: problem.memoryLimitMb ?? 256 })}</TableCell>
                  <TableCell>
                    <Badge variant={problem.visibility === "public" ? "default" : "secondary"}>
                      {visibilityLabels[problem.visibility as keyof typeof visibilityLabels] ?? problem.visibility}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/dashboard/problems/${problem.id}`}>
                        <Button variant="outline" size="sm">{t("solve")}</Button>
                      </Link>
                      {(problem.authorId === session.user.id ||
                        session.user.role === "admin" ||
                        session.user.role === "super_admin") && (
                        <Link href={`/dashboard/problems/${problem.id}/edit`}>
                          <Button size="sm">{tCommon("edit")}</Button>
                        </Link>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredProblems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {t("noProblems")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
