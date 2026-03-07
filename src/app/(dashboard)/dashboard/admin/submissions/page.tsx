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
import { submissions, users, problems } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminSubmissionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "super_admin") redirect("/dashboard");

  const t = await getTranslations("admin.submissions");
  
  const allSubmissions = await db
    .select({
      id: submissions.id,
      language: submissions.language,
      status: submissions.status,
      submittedAt: submissions.submittedAt,
      score: submissions.score,
      user: {
        name: users.name,
      },
      problem: {
        title: problems.title,
      }
    })
    .from(submissions)
    .leftJoin(users, eq(submissions.userId, users.id))
    .leftJoin(problems, eq(submissions.problemId, problems.id))
    .orderBy(desc(submissions.submittedAt))
    .limit(100);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{t("title")}</h2>
      <Card>
        <CardHeader>
          <CardTitle>Recent Submissions (All Users)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Submitted At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allSubmissions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell className="font-mono text-xs">{sub.id.substring(0, 8)}</TableCell>
                  <TableCell>{sub.user?.name || "Unknown"}</TableCell>
                  <TableCell>{sub.problem?.title || "Unknown"}</TableCell>
                  <TableCell>{sub.language}</TableCell>
                  <TableCell>
                    <Badge variant={sub.status === "accepted" ? "default" : sub.status === "pending" || sub.status === "judging" ? "secondary" : "destructive"}>
                      {sub.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{sub.score !== null ? sub.score : "-"}</TableCell>
                  <TableCell>
                    {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "-"}
                  </TableCell>
                </TableRow>
              ))}
              {allSubmissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No submissions found.
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
