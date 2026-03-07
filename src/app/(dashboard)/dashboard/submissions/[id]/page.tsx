import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { db } from "@/lib/db";
import { submissions, submissionResults, testCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const resolvedParams = await params;
  const submissionId = resolvedParams.id;

  const t = await getTranslations("submissions");
  
  const submission = await db.query.submissions.findFirst({
    where: eq(submissions.id, submissionId),
    with: {
      user: {
        columns: { name: true, email: true }
      },
      problem: {
        columns: { id: true, title: true }
      }
    }
  });

  if (!submission) {
    notFound();
  }

  // Access control
  if (submission.userId !== session.user.id && session.user.role !== "admin" && session.user.role !== "super_admin" && session.user.role !== "instructor") {
    redirect("/dashboard/submissions");
  }

  const results = await db
    .select({
      id: submissionResults.id,
      status: submissionResults.status,
      executionTimeMs: submissionResults.executionTimeMs,
      memoryUsedKb: submissionResults.memoryUsedKb,
      testCase: {
        sortOrder: testCases.sortOrder,
      }
    })
    .from(submissionResults)
    .leftJoin(testCases, eq(submissionResults.testCaseId, testCases.id))
    .where(eq(submissionResults.submissionId, submissionId));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold mb-2">{t("submissionId", { id: submission.id.substring(0,8) })}</h2>
          <div className="flex gap-2">
            <Badge variant="outline">{t("user")}: {submission.user?.name}</Badge>
            <Badge variant="outline">{t("table.problem")}: {submission.problem?.title}</Badge>
            <Badge variant="outline">{t("table.language")}: {submission.language}</Badge>
            <Badge variant={submission.status === "accepted" ? "default" : submission.status === "pending" || submission.status === "judging" ? "secondary" : "destructive"}>
              {submission.status}
            </Badge>
          </div>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <p>{t("submitted")}: {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : "-"}</p>
          <p>{t("score")}: {submission.score !== null ? submission.score : "-"}</p>
          <p>{t("time")}: {submission.executionTimeMs ? `${submission.executionTimeMs} ms` : "-"}</p>
          <p>{t("memory")}: {submission.memoryUsedKb ? `${submission.memoryUsedKb} KB` : "-"}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("sourceCode")}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="p-4 bg-muted rounded-lg overflow-x-auto">
            <code>{submission.sourceCode}</code>
          </pre>
        </CardContent>
      </Card>

      {submission.compileOutput && (
        <Card>
          <CardHeader>
            <CardTitle>{t("compileOutput")}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-red-500">
              <code>{submission.compileOutput}</code>
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("testCaseResults")}</CardTitle>
          <CardDescription>{t("testCaseResultsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("testCaseTable.testCase")}</TableHead>
                <TableHead>{t("testCaseTable.status")}</TableHead>
                <TableHead>{t("testCaseTable.time")}</TableHead>
                <TableHead>{t("testCaseTable.memory")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.sort((a, b) => (a.testCase?.sortOrder || 0) - (b.testCase?.sortOrder || 0)).map((res, i) => (
                <TableRow key={res.id}>
                  <TableCell>#{i + 1}</TableCell>
                  <TableCell>
                    <Badge variant={res.status === "accepted" ? "default" : "destructive"}>
                      {res.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{res.executionTimeMs !== null ? res.executionTimeMs : "-"}</TableCell>
                  <TableCell>{res.memoryUsedKb !== null ? res.memoryUsedKb : "-"}</TableCell>
                </TableRow>
              ))}
              {results.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t("noResults")}
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
