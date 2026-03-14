import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { db } from "@/lib/db";
import { assignments, groups, problems, submissions, users } from "@/lib/db/schema";
import { and, desc, eq, like, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { formatSubmissionIdPrefix } from "@/lib/submissions/id";
import { buildStatusLabels } from "@/lib/judge/status-labels";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("submissions");
  return { title: t("title") };
}

const PAGE_SIZE = 25;

type StudentSubmissionRow = {
  id: string;
  language: string;
  status: string | null;
  submittedAt: Date | null;
  score: number | null;
  problem: {
    id: string | null;
    title: string | null;
  } | null;
};

type InstructorSubmissionRow = StudentSubmissionRow & {
  student: {
    id: string | null;
    name: string | null;
  } | null;
  assignment: {
    id: string | null;
    title: string | null;
  } | null;
};

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; search?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const currentPage = Math.max(1, Number(resolvedSearchParams?.page ?? "1") || 1);
  const searchQuery = (resolvedSearchParams?.search ?? "").trim().slice(0, 200);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const t = await getTranslations("submissions");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();
  const timeZone = await getResolvedSystemTimeZone();
  const isInstructorView = session.user.role === "instructor";
  const statusLabels = buildStatusLabels(t);

  const searchFilter = searchQuery
    ? or(
        like(problems.title, `%${escapeLike(searchQuery)}%`),
        like(users.name, `%${escapeLike(searchQuery)}%`)
      )
    : undefined;

  const userSubmissions: InstructorSubmissionRow[] | StudentSubmissionRow[] = isInstructorView
    ? await db
        .select({
          id: submissions.id,
          language: submissions.language,
          status: submissions.status,
          submittedAt: submissions.submittedAt,
          score: submissions.score,
          student: {
            id: users.id,
            name: users.name,
          },
          assignment: {
            id: assignments.id,
            title: assignments.title,
          },
          problem: {
            id: problems.id,
            title: problems.title,
          },
        })
        .from(submissions)
        .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
        .innerJoin(groups, eq(assignments.groupId, groups.id))
        .leftJoin(users, eq(submissions.userId, users.id))
        .leftJoin(problems, eq(submissions.problemId, problems.id))
        .where(
          searchFilter
            ? and(eq(groups.instructorId, session.user.id), searchFilter)
            : eq(groups.instructorId, session.user.id)
        )
        .orderBy(desc(submissions.submittedAt))
        .limit(PAGE_SIZE + 1)
        .offset(offset)
    : await db
        .select({
          id: submissions.id,
          language: submissions.language,
          status: submissions.status,
          submittedAt: submissions.submittedAt,
          score: submissions.score,
          problem: {
            id: problems.id,
            title: problems.title,
          },
        })
        .from(submissions)
        .leftJoin(problems, eq(submissions.problemId, problems.id))
        .leftJoin(users, eq(submissions.userId, users.id))
        .where(
          searchFilter
            ? and(eq(submissions.userId, session.user.id), searchFilter)
            : eq(submissions.userId, session.user.id)
        )
        .orderBy(desc(submissions.submittedAt))
        .limit(PAGE_SIZE + 1)
        .offset(offset);

  const hasNextPage = userSubmissions.length > PAGE_SIZE;
  const visibleSubmissions = hasNextPage ? userSubmissions.slice(0, PAGE_SIZE) : userSubmissions;
  const rangeStart = visibleSubmissions.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + visibleSubmissions.length;

  const buildPageHref = (page: number) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (searchQuery) params.set("search", searchQuery);
    const qs = params.toString();
    return qs ? `/dashboard/submissions?${qs}` : "/dashboard/submissions";
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold mb-4">
        {isInstructorView ? t("instructorTitle") : t("title")}
      </h2>
      <Card>
        <CardHeader>
          <CardTitle>{t("search")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 md:flex-row md:items-end" method="get">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium" htmlFor="submissions-search">
                {t("searchLabel")}
              </label>
              <Input
                id="submissions-search"
                name="search"
                type="search"
                defaultValue={searchQuery}
                placeholder={t("searchPlaceholder")}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">{tCommon("search")}</Button>
              <Link href="/dashboard/submissions">
                <Button type="button" variant="outline">{t("resetSearch")}</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{isInstructorView ? t("groupSubmissions") : t("mySubmissions")}</CardTitle>
        </CardHeader>
        <CardContent>
          {visibleSubmissions.length > 0 && (
            <p className="mb-4 text-sm text-muted-foreground">
              {t("pagination.showingRange", { start: rangeStart, end: rangeEnd })}
            </p>
          )}

          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.id")}</TableHead>
                {isInstructorView && <TableHead>{t("table.student")}</TableHead>}
                {isInstructorView && <TableHead>{t("table.assignment")}</TableHead>}
                <TableHead>{t("table.problem")}</TableHead>
                <TableHead>{t("table.language")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.score")}</TableHead>
                <TableHead>{t("table.submittedAt")}</TableHead>
                <TableHead>{t("table.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleSubmissions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/dashboard/submissions/${sub.id}`} className="text-primary hover:underline">
                      {formatSubmissionIdPrefix(sub.id)}
                    </Link>
                  </TableCell>
                  {isInstructorView && (
                    <TableCell>
                      {(sub as InstructorSubmissionRow).student?.name || tCommon("unknown")}
                    </TableCell>
                  )}
                  {isInstructorView && (
                    <TableCell>
                      {(sub as InstructorSubmissionRow).assignment?.title || tCommon("unknown")}
                    </TableCell>
                  )}
                  <TableCell>
                    {sub.problem ? (
                      <Link href={`/dashboard/problems/${sub.problem.id}`} className="text-primary hover:underline">
                        {sub.problem.title}
                      </Link>
                    ) : (
                      tCommon("unknown")
                    )}
                  </TableCell>
                  <TableCell>{sub.language}</TableCell>
                  <TableCell>
                    <SubmissionStatusBadge
                      label={statusLabels[sub.status as keyof typeof statusLabels] ?? sub.status}
                      status={sub.status}
                    />
                  </TableCell>
                  <TableCell>{sub.score !== null ? sub.score : "-"}</TableCell>
                  <TableCell>
                    {sub.submittedAt
                      ? formatDateTimeInTimeZone(sub.submittedAt, locale, timeZone)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/submissions/${sub.id}`}>
                      <Button variant="outline" size="sm">{tCommon("view")}</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {visibleSubmissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isInstructorView ? 9 : 7} className="text-center text-muted-foreground">
                    {t("noSubmissions")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {currentPage > 1 ? (
          <Link href={buildPageHref(currentPage - 1)}>
            <Button variant="outline">{tCommon("previous")}</Button>
          </Link>
        ) : (
          <Button variant="outline" disabled>
            {tCommon("previous")}
          </Button>
        )}

        {hasNextPage ? (
          <Link href={buildPageHref(currentPage + 1)}>
            <Button variant="outline">{tCommon("next")}</Button>
          </Link>
        ) : (
          <Button variant="outline" disabled>
            {tCommon("next")}
          </Button>
        )}
      </div>
    </div>
  );
}
