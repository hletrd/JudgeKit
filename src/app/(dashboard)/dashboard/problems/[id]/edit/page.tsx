import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { problems, submissions, problemTags, tags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import CreateProblemForm from "@/app/(dashboard)/dashboard/problems/create/create-problem-form";
import { ProblemDeleteButton } from "../problem-delete-button";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getResolvedPlatformMode, getPlatformModePolicy } from "@/lib/system-settings";

export default async function EditProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, id),
    with: {
      testCases: true,
    },
  });

  if (!problem) {
    notFound();
  }

  const canEdit =
    problem.authorId === session.user.id ||
    session.user.role === "admin" ||
    session.user.role === "super_admin";
  const canOverrideTestCases =
    session.user.role === "admin" || session.user.role === "super_admin";

  if (!canEdit) {
    redirect(`/dashboard/problems/${problem.id}`);
  }

  const t = await getTranslations("problems");
  const platformMode = await getResolvedPlatformMode();
  const forceDisableAiAssistant = getPlatformModePolicy(platformMode).restrictAiByDefault;
  const hasSubmissions = Boolean(
    await db.query.submissions.findFirst({
      where: eq(submissions.problemId, problem.id),
      columns: { id: true },
    })
  );
  const sortedTestCases = [...problem.testCases].sort(
    (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
  );

  // Fetch tags for this problem
  const problemTagRows = await db
    .select({ name: tags.name })
    .from(problemTags)
    .innerJoin(tags, eq(problemTags.tagId, tags.id))
    .where(eq(problemTags.problemId, problem.id));
  const problemTagNames = problemTagRows.map((t) => t.name);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{t("editTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("deleteHelpText")}</p>
        </div>
        <ProblemDeleteButton problemId={problem.id} problemTitle={problem.title} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("editDescription")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateProblemForm
            mode="edit"
            canUploadFiles={(await resolveCapabilities(session.user.role)).has("files.upload")}
            initialProblem={{
              id: problem.id,
              title: problem.title,
              description: problem.description ?? "",
              sequenceNumber: problem.sequenceNumber ?? null,
              problemType: (problem.problemType ?? "auto") as "auto" | "manual",
              timeLimitMs: problem.timeLimitMs ?? 2000,
              memoryLimitMb: problem.memoryLimitMb ?? 256,
              visibility: (problem.visibility ?? "private") as "public" | "private" | "hidden",
              showCompileOutput: problem.showCompileOutput ?? true,
              showDetailedResults: problem.showDetailedResults ?? true,
              showRuntimeErrors: problem.showRuntimeErrors ?? true,
              allowAiAssistant: problem.allowAiAssistant ?? true,
              comparisonMode: (problem.comparisonMode ?? "exact") as "exact" | "float",
              floatAbsoluteError: problem.floatAbsoluteError ?? null,
              floatRelativeError: problem.floatRelativeError ?? null,
              difficulty: problem.difficulty ?? null,
              defaultLanguage: problem.defaultLanguage ?? null,
              testCases: sortedTestCases.map((testCase) => ({
                input: testCase.input,
                expectedOutput: testCase.expectedOutput,
                isVisible: testCase.isVisible ?? false,
              })),
              tags: problemTagNames,
            }}
            testCasesLocked={hasSubmissions}
            allowTestCaseOverride={hasSubmissions && canOverrideTestCases}
            forceDisableAiAssistant={forceDisableAiAssistant}
            editorTheme={session.user.editorTheme}
          />
        </CardContent>
      </Card>
    </div>
  );
}
