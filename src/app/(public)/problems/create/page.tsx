import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { problemTags, problems, tags } from "@/lib/db/schema";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import CreateProblemForm from "./create-problem-form";
import { getResolvedPlatformMode, getPlatformModePolicy } from "@/lib/system-settings";

export default async function CreateProblemPage({
  searchParams,
}: {
  searchParams?: Promise<{ duplicateFrom?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("problems.create")) {
    redirect("/problems");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const duplicateFrom = resolvedSearchParams?.duplicateFrom?.trim() ?? "";
  const t = await getTranslations("problems");
  const platformMode = await getResolvedPlatformMode();
  const forceDisableAiAssistant = getPlatformModePolicy(platformMode).restrictAiByDefault;
  const initialProblem = duplicateFrom
    ? await db.query.problems.findFirst({
        where: eq(problems.id, duplicateFrom),
        with: {
          testCases: true,
        },
      })
    : null;

  let duplicateProblemData = null;
  if (initialProblem) {
    const canReuseSource = initialProblem.authorId === session.user.id || caps.has("problems.edit") || caps.has("problems.view_all");

    if (!canReuseSource) {
      redirect("/problems");
    }

    const problemTagRows = await db
      .select({ name: tags.name })
      .from(problemTags)
      .innerJoin(tags, eq(problemTags.tagId, tags.id))
      .where(eq(problemTags.problemId, initialProblem.id));
    const problemTagNames = problemTagRows.map((tag) => tag.name);

    duplicateProblemData = {
      id: initialProblem.id,
      title: initialProblem.title,
      description: initialProblem.description ?? "",
      sequenceNumber: initialProblem.sequenceNumber ?? null,
      problemType: (initialProblem.problemType ?? "auto") as "auto" | "manual",
      timeLimitMs: initialProblem.timeLimitMs ?? 2000,
      memoryLimitMb: initialProblem.memoryLimitMb ?? 256,
      visibility: (initialProblem.visibility ?? "private") as "public" | "private" | "hidden",
      showCompileOutput: initialProblem.showCompileOutput ?? true,
      showDetailedResults: initialProblem.showDetailedResults ?? true,
      showRuntimeErrors: initialProblem.showRuntimeErrors ?? true,
      allowAiAssistant: initialProblem.allowAiAssistant ?? true,
      comparisonMode: (initialProblem.comparisonMode ?? "exact") as "exact" | "float",
      floatAbsoluteError: initialProblem.floatAbsoluteError ?? null,
      floatRelativeError: initialProblem.floatRelativeError ?? null,
      difficulty: initialProblem.difficulty ?? null,
      defaultLanguage: initialProblem.defaultLanguage ?? null,
      testCases: [...initialProblem.testCases]
        .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
        .map((testCase) => ({
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          isVisible: testCase.isVisible ?? false,
        })),
      tags: problemTagNames,
    };
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">
        {duplicateProblemData ? t("duplicateTitle") : t("createTitle")}
      </h2>
      
      <Card>
        <CardHeader>
          <CardTitle>{duplicateProblemData ? t("duplicateDescription") : t("createDescription")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateProblemForm
            mode={duplicateProblemData ? "duplicate" : "create"}
            canUploadFiles={caps.has("files.upload")}
            initialProblem={duplicateProblemData ?? undefined}
            forceDisableAiAssistant={forceDisableAiAssistant}
            editorTheme={session.user.editorTheme}
          />
        </CardContent>
      </Card>
    </div>
  );
}
