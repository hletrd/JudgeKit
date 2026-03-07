import { getTranslations } from "next-intl/server";
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
import { submissions, problems } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSubmissionStatusVariant } from "@/lib/submissions/status";

const PAGE_SIZE = 25;

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
  const statusLabels = {
    pending: t("status.pending"),
    queued: t("status.queued"),
    judging: t("status.judging"),
    accepted: t("status.accepted"),
    wrong_answer: t("status.wrong_answer"),
    time_limit: t("status.time_limit"),
    memory_limit: t("status.memory_limit"),
    runtime_error: t("status.runtime_error"),
    compile_error: t("status.compile_error"),
  };
  
  const userSubmissions = await db
    .select({
      id: submissions.id,
      language: submissions.language,
      status: submissions.status,
      submittedAt: submissions.submittedAt,
      score: submissions.score,
      problem: {
        id: problems.id,
        title: problems.title,
      }
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
      <h2 className="text-2xl font-bold mb-4">{t("title")}</h2>
      <Card>
        <CardHeader>
          <CardTitle>{t("mySubmissions")}</CardTitle>
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
                      {sub.id.substring(0, 8)}
                    </Link>
                  </TableCell>
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
                    <Badge variant={getSubmissionStatusVariant(sub.status)}>
                      {statusLabels[sub.status as keyof typeof statusLabels] ?? sub.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{sub.score !== null ? sub.score : "-"}</TableCell>
                  <TableCell>
                    {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "-"}
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
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
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
