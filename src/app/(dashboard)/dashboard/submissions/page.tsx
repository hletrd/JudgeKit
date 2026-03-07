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

export default async function SubmissionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("submissions");
  
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
    .limit(50);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{t("title")}</h2>
      <Card>
        <CardHeader>
          <CardTitle>My Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Submitted At</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userSubmissions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell className="font-mono text-xs">{sub.id.substring(0, 8)}</TableCell>
                  <TableCell>
                    {sub.problem ? (
                      <Link href={`/dashboard/problems/${sub.problem.id}`} className="hover:underline text-blue-600">
                        {sub.problem.title}
                      </Link>
                    ) : (
                      "Unknown"
                    )}
                  </TableCell>
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
                  <TableCell>
                    <Link href={`/dashboard/submissions/${sub.id}`}>
                      <Button variant="outline" size="sm">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {userSubmissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    You haven't made any submissions yet.
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
