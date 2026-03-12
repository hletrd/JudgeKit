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
import { submissions, users, problems } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { formatSubmissionIdPrefix } from "@/lib/submissions/id";
import { buildStatusLabels } from "@/lib/judge/status-labels";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.submissions");
  return { title: t("title") };
}

const PAGE_SIZE = 50;

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "super_admin") redirect("/dashboard");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const currentPage = Math.max(1, Number(resolvedSearchParams?.page ?? "1") || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const t = await getTranslations("admin.submissions");
  const tCommon = await getTranslations("common");
  const tSubmissions = await getTranslations("submissions");
  const locale = await getLocale();
  const timeZone = await getResolvedSystemTimeZone();
  const statusLabels = buildStatusLabels(tSubmissions);
  const allSubmissions = await db
    .select({
      id: submissions.id,
      language: submissions.language,
      status: submissions.status,
      submittedAt: submissions.submittedAt,
      score: submissions.score,
      user: {
        id: users.id,
        name: users.name,
      },
      problem: {
        id: problems.id,
        title: problems.title,
      },
    })
    .from(submissions)
    .leftJoin(users, eq(submissions.userId, users.id))
    .leftJoin(problems, eq(submissions.problemId, problems.id))
    .orderBy(desc(submissions.submittedAt))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasNextPage = allSubmissions.length > PAGE_SIZE;
  const visibleSubmissions = hasNextPage ? allSubmissions.slice(0, PAGE_SIZE) : allSubmissions;
  const rangeStart = visibleSubmissions.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + visibleSubmissions.length;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold mb-4">{t("title")}</h2>
      <Card>
        <CardHeader>
          <CardTitle>{t("recent")}</CardTitle>
        </CardHeader>
        <CardContent>
          {visibleSubmissions.length > 0 && (
            <p className="mb-4 text-sm text-muted-foreground">
              {tSubmissions("pagination.showingRange", { start: rangeStart, end: rangeEnd })}
            </p>
          )}

          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.id")}</TableHead>
                <TableHead>{t("table.user")}</TableHead>
                <TableHead>{t("table.problem")}</TableHead>
                <TableHead>{t("table.language")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.score")}</TableHead>
                <TableHead>{t("table.submittedAt")}</TableHead>
                <TableHead>{tCommon("action")}</TableHead>
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
                  <TableCell>
                    {sub.user ? (
                      <Link href={`/dashboard/admin/users/${sub.user.id}`} className="text-primary hover:underline">
                        {sub.user.name}
                      </Link>
                    ) : (
                      tCommon("unknown")
                    )}
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
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
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
          <Link href={`/dashboard/admin/submissions?page=${currentPage - 1}`}>
            <Button variant="outline">{tCommon("previous")}</Button>
          </Link>
        ) : (
          <Button variant="outline" disabled>
            {tCommon("previous")}
          </Button>
        )}

        {hasNextPage ? (
          <Link href={`/dashboard/admin/submissions?page=${currentPage + 1}`}>
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
