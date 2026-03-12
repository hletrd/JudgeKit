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
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { formatSubmissionIdPrefix } from "@/lib/submissions/id";
import { buildStatusLabels } from "@/lib/judge/status-labels";

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

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const currentPage = Math.max(1, Number(resolvedSearchParams?.page ?? "1") || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const t = await getTranslations("submissions");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();
  const timeZone = await getResolvedSystemTimeZone();
  const isInstructorView = session.user.role === "instructor";
  const statusLabels = buildStatusLabels(t);
  
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
        .where(eq(groups.instructorId, session.user.id))
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
        .where(eq(submissions.userId, session.user.id))
        .orderBy(desc(submissions.submittedAt))
        .limit(PAGE_SIZE + 1)
        .offset(offset);

  const hasNextPage = userSubmissions.length > PAGE_SIZE;
  const visibleSubmissions = hasNextPage ? userSubmissions.slice(0, PAGE_SIZE) : userSubmissions;
  const rangeStart = visibleSubmissions.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + visibleSubmissions.length;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold mb-4">
        {isInstructorView ? t("instructorTitle") : t("title")}
      </h2>
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
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {currentPage > 1 ? (
          <Link href={`/dashboard/submissions?page=${currentPage - 1}`}>
            <Button variant="outline">{tCommon("previous")}</Button>
          </Link>
        ) : (
          <Button variant="outline" disabled>
            {tCommon("previous")}
          </Button>
        )}

        {hasNextPage ? (
          <Link href={`/dashboard/submissions?page=${currentPage + 1}`}>
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
