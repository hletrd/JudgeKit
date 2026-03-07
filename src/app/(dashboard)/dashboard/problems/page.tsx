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
import { problems, users } from "@/lib/db/schema";
import { desc, eq, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function ProblemsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("problems");
  
  // Fetch public problems or problems authored by the user
  const allProblems = await db
    .select({
      id: problems.id,
      title: problems.title,
      timeLimitMs: problems.timeLimitMs,
      memoryLimitMb: problems.memoryLimitMb,
      visibility: problems.visibility,
      createdAt: problems.createdAt,
      author: {
        name: users.name,
      }
    })
    .from(problems)
    .leftJoin(users, eq(problems.authorId, users.id))
    .where(or(
      eq(problems.visibility, "public"),
      eq(problems.authorId, session.user.id)
    ))
    .orderBy(desc(problems.createdAt));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        {(session.user.role === "admin" || session.user.role === "super_admin" || session.user.role === "instructor") && (
          <Button>Create Problem</Button>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Available Problems</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Time Limit</TableHead>
                <TableHead>Memory Limit</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allProblems.map((problem) => (
                <TableRow key={problem.id}>
                  <TableCell className="font-medium">{problem.title}</TableCell>
                  <TableCell>{problem.author?.name || "System"}</TableCell>
                  <TableCell>{problem.timeLimitMs} ms</TableCell>
                  <TableCell>{problem.memoryLimitMb} MB</TableCell>
                  <TableCell>
                    <Badge variant={problem.visibility === "public" ? "default" : "secondary"}>
                      {problem.visibility}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/problems/${problem.id}`}>
                      <Button variant="outline" size="sm">Solve</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {allProblems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No problems available.
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
