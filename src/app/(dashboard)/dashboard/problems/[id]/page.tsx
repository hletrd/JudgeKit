import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { problems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default async function ProblemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const resolvedParams = await params;
  const problemId = resolvedParams.id;

  const t = await getTranslations("problems");
  
  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, problemId),
    with: {
      author: {
        columns: { name: true }
      }
    }
  });

  if (!problem) {
    notFound();
  }

  // Basic access control (simplified for now)
  if (problem.visibility === "private" && problem.authorId !== session.user.id && session.user.role !== "admin" && session.user.role !== "super_admin") {
    redirect("/dashboard/problems");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">{problem.title}</h2>
          <div className="flex gap-2 text-sm text-muted-foreground mb-4">
            <Badge variant="outline">Time Limit: {problem.timeLimitMs}ms</Badge>
            <Badge variant="outline">Memory Limit: {problem.memoryLimitMb}MB</Badge>
            <Badge variant="secondary">Author: {problem.author?.name || "System"}</Badge>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none">
            <div dangerouslySetInnerHTML={{ __html: problem.description || "No description provided." }} />
          </CardContent>
        </Card>
      </div>

      <div>
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle>Submit Solution</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" action="/api/v1/submissions" method="POST">
              <input type="hidden" name="problemId" value={problem.id} />
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select name="language" defaultValue="python">
                  <SelectTrigger id="language">
                    <SelectValue placeholder="Select Language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="c17">C17 (GCC)</SelectItem>
                    <SelectItem value="cpp23">C++23 (GCC)</SelectItem>
                    <SelectItem value="python">Python 3.13</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sourceCode">Source Code</Label>
                <Textarea 
                  id="sourceCode" 
                  name="sourceCode" 
                  className="font-mono min-h-[300px]" 
                  placeholder="Write your code here..." 
                  required
                />
              </div>
              <Button type="submit" className="w-full">Submit</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
