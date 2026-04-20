import type { Metadata } from "next";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { languageConfigs, problems, submissions, problemTags } from "@/lib/db/schema";
import { PublicProblemDetail } from "@/app/(public)/_components/public-problem-detail";
import { JsonLd } from "@/components/seo/json-ld";
import { AssistantMarkdown } from "@/components/assistant-markdown";
import { listProblemDiscussionThreads, listProblemEditorials, listProblemSolutionThreads } from "@/lib/discussions/data";
import { DiscussionThreadForm } from "@/components/discussions/discussion-thread-form";
import { DiscussionThreadList } from "@/components/discussions/discussion-thread-list";
import { DiscussionVoteButtons } from "@/components/discussions/discussion-vote-buttons";
import { AcceptedSolutions } from "@/components/problem/accepted-solutions";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { buildStatusLabels } from "@/lib/judge/status-labels";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PublicQuickSubmit } from "@/components/problem/public-quick-submit";
import { buildAbsoluteUrl, buildLocalePath, buildPublicMetadata, buildSocialImageUrl, NO_INDEX_METADATA, summarizeTextForMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { TierBadge } from "@/components/tier-badge";
import { getProblemTierInfo } from "@/lib/problem-tiers";
import { getJudgeLanguageDefinition } from "@/lib/judge/languages";
import { ProblemKeyboardNav } from "./problem-keyboard-nav";
import { formatSubmissionIdPrefix } from "@/lib/submissions/format";
import Link from "next/link";
import { resolveCapabilities } from "@/lib/capabilities/cache";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [problem, t, tProblems, locale] = await Promise.all([
    db.query.problems.findFirst({
      where: eq(problems.id, id),
      columns: {
        title: true,
        description: true,
        visibility: true,
        sequenceNumber: true,
        difficulty: true,
        timeLimitMs: true,
        memoryLimitMb: true,
      },
      with: {
        author: { columns: { name: true } },
        problemTags: {
          with: { tag: { columns: { name: true } } },
        },
      },
    }),
    getTranslations("common"),
    getTranslations("problems"),
    getLocale(),
  ]);

  if (!problem || problem.visibility !== "public") {
    return {
      title: "Problem",
      ...NO_INDEX_METADATA,
    };
  }

  const settings = await getResolvedSystemSettings({
    siteTitle: t("appName"),
    siteDescription: t("appDescription"),
  });

  return buildPublicMetadata({
    title: problem.title,
    description: summarizeTextForMetadata(problem.description),
    path: `/practice/problems/${id}`,
    siteTitle: settings.siteTitle,
    locale,
    keywords: [
      "programming problem",
      "algorithm challenge",
      ...problem.problemTags.map((entry) => entry.tag.name),
      ...(problem.author?.name ? [problem.author.name] : []),
    ],
    section: tProblems("title"),
    socialBadge: problem.sequenceNumber != null ? `#${problem.sequenceNumber}` : undefined,
    socialMeta: [
      problem.difficulty != null ? `${tProblems("table.difficulty")} ${problem.difficulty.toFixed(2)}` : null,
      problem.timeLimitMs != null ? `${problem.timeLimitMs} ms` : null,
      problem.memoryLimitMb != null ? `${problem.memoryLimitMb} MB` : null,
    ].filter(Boolean).join(" • ") || undefined,
    socialFooter: problem.problemTags.slice(0, 3).map((entry) => entry.tag.name).join(" • ") || undefined,
    type: "article",
  });
}

export default async function PublicProblemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, tCommon, tProblems, tSubmissions, tRankings, session, locale] = await Promise.all([
    getTranslations("publicShell"),
    getTranslations("common"),
    getTranslations("problems"),
    getTranslations("submissions"),
    getTranslations("rankings"),
    auth(),
    getLocale(),
  ]);
  const caps = session?.user ? await resolveCapabilities(session.user.role) : new Set<string>();

  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, id),
    with: {
      author: { columns: { name: true } },
      problemTags: {
        with: { tag: { columns: { id: true, name: true, color: true } } },
      },
    },
  });

  if (!problem || problem.visibility !== "public") {
    notFound();
  }

  const timeZone = await getResolvedSystemTimeZone();
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });
  const langs = await db.select({ id: languageConfigs.id, language: languageConfigs.language, displayName: languageConfigs.displayName, standard: languageConfigs.standard, isEnabled: languageConfigs.isEnabled }).from(languageConfigs).where(eq(languageConfigs.isEnabled, true));
  const enabledLanguages = langs.flatMap((language) => {
    const definition = getJudgeLanguageDefinition(language.language);

    if (!definition) {
      return [];
    }

    return [{
      id: language.id,
      language: language.language,
      displayName: definition.displayName,
      standard: definition.standard,
    }];
  });
  const threads = await listProblemDiscussionThreads(problem.id, session?.user?.id ?? null);
  const solutionThreads = await listProblemSolutionThreads(problem.id, session?.user?.id ?? null);
  const editorials = await listProblemEditorials(problem.id, session?.user?.id ?? null);

  // Problem statistics
  const [statsRow] = await db
    .select({
      totalSubmissions: count(),
      acceptedCount: sql<number>`count(case when ${submissions.status} = 'accepted' then 1 end)`,
      uniqueSolvers: sql<number>`count(distinct case when ${submissions.status} = 'accepted' then ${submissions.userId} end)`,
    })
    .from(submissions)
    .where(eq(submissions.problemId, problem.id));

  const totalSubmissions = Number(statsRow?.totalSubmissions ?? 0);
  const acceptedCount = Number(statsRow?.acceptedCount ?? 0);
  const uniqueSolvers = Number(statsRow?.uniqueSolvers ?? 0);
  const acceptanceRate = totalSubmissions > 0 ? ((acceptedCount / totalSubmissions) * 100).toFixed(1) : "0.0";

  // Similar problems (share at least one tag, exclude current)
  const tagIds = problem.problemTags.map((pt) => pt.tag.id);
  let similarProblems: Array<{ id: string; title: string; sequenceNumber: number | null; difficulty: number | null }> = [];
  if (tagIds.length > 0) {
    similarProblems = await db
      .selectDistinct({
        id: problems.id,
        title: problems.title,
        sequenceNumber: problems.sequenceNumber,
        difficulty: problems.difficulty,
      })
      .from(problemTags)
      .innerJoin(problems, eq(problemTags.problemId, problems.id))
      .where(
        and(
          inArray(problemTags.tagId, tagIds),
          eq(problems.visibility, "public"),
          sql`${problems.id} != ${problem.id}`
        )
      )
      .limit(5);
  }

  // Previous / next problem navigation (by sequenceNumber)
  let prevProblem: { id: string } | null = null;
  let nextProblem: { id: string } | null = null;
  if (problem.sequenceNumber != null) {
    [prevProblem, nextProblem] = await Promise.all([
      db.select({ id: problems.id })
        .from(problems)
        .where(and(
          eq(problems.visibility, "public"),
          sql`${problems.sequenceNumber} < ${problem.sequenceNumber}`,
          sql`${problems.sequenceNumber} IS NOT NULL`
        ))
        .orderBy(sql`${problems.sequenceNumber} DESC`)
        .limit(1)
        .then(rows => rows[0] ?? null),
      db.select({ id: problems.id })
        .from(problems)
        .where(and(
          eq(problems.visibility, "public"),
          sql`${problems.sequenceNumber} > ${problem.sequenceNumber}`,
          sql`${problems.sequenceNumber} IS NOT NULL`
        ))
        .orderBy(sql`${problems.sequenceNumber} ASC`)
        .limit(1)
        .then(rows => rows[0] ?? null),
    ]);
  }

  // User's submissions for this problem (when logged in)
  let userSubmissions: Array<{
    id: string;
    language: string;
    status: string | null;
    score: number | null;
    executionTimeMs: number | null;
    memoryUsedKb: number | null;
    submittedAt: Date | null;
    failedTestCaseIndex: number | null;
    runtimeErrorType: string | null;
  }> = [];

  if (session?.user) {
    userSubmissions = await db
      .select({
        id: submissions.id,
        language: submissions.language,
        status: submissions.status,
        score: submissions.score,
        executionTimeMs: submissions.executionTimeMs,
        memoryUsedKb: submissions.memoryUsedKb,
        submittedAt: submissions.submittedAt,
        failedTestCaseIndex: submissions.failedTestCaseIndex,
        runtimeErrorType: submissions.runtimeErrorType,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, session.user.id),
          eq(submissions.problemId, problem.id)
        )
      )
      .orderBy(sql`${submissions.submittedAt} DESC`)
      .limit(20);
  }

  const statusLabels = buildStatusLabels(tSubmissions);
  const socialImageUrl = buildSocialImageUrl({
    title: problem.title,
    description: summarizeTextForMetadata(problem.description),
    locale,
    siteTitle: settings.siteTitle,
    section: tProblems("title"),
    badge: problem.sequenceNumber != null ? `#${problem.sequenceNumber}` : undefined,
    meta: [
      problem.difficulty != null ? `${tProblems("table.difficulty")} ${problem.difficulty.toFixed(2)}` : null,
      problem.timeLimitMs != null ? `${problem.timeLimitMs} ms` : null,
      problem.memoryLimitMb != null ? `${problem.memoryLimitMb} MB` : null,
    ].filter(Boolean).join(" • ") || undefined,
    footer: problem.problemTags.slice(0, 3).map((entry) => entry.tag.name).join(" • ") || undefined,
  });

  const problemJsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: problem.title,
    description: summarizeTextForMetadata(problem.description),
    url: buildAbsoluteUrl(buildLocalePath(`/practice/problems/${problem.id}`, locale)),
    mainEntityOfPage: buildAbsoluteUrl(buildLocalePath(`/practice/problems/${problem.id}`, locale)),
    inLanguage: locale,
    image: [socialImageUrl],
    author: problem.author?.name
      ? {
          "@type": "Person",
          name: problem.author.name,
        }
      : undefined,
    publisher: {
      "@type": "Organization",
      name: settings.siteTitle,
    },
    about: problem.problemTags.map((entry) => ({
      "@type": "Thing",
      name: entry.tag.name,
    })),
    keywords: problem.problemTags.map((entry) => entry.tag.name).join(", "),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: tCommon("appName"),
        item: buildAbsoluteUrl(buildLocalePath("/", locale)),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: t("nav.practice"),
        item: buildAbsoluteUrl(buildLocalePath("/practice", locale)),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: problem.title,
        item: buildAbsoluteUrl(buildLocalePath(`/practice/problems/${problem.id}`, locale)),
      },
    ],
  };
  const problemPageHref = buildLocalePath(`/practice/problems/${problem.id}`, locale);
  const contestlessPlaygroundHref = buildLocalePath("/playground", locale);
  const signInHref = buildLocalePath(
    `/login?callbackUrl=${encodeURIComponent(buildLocalePath(`/practice/problems/${problem.id}`, locale))}`,
    locale,
  );

  return (
    <>
      <JsonLd data={[problemJsonLd, breadcrumbJsonLd]} />
      <ProblemKeyboardNav
        prevProblemId={prevProblem?.id ?? null}
        nextProblemId={nextProblem?.id ?? null}
        locale={locale}
      />
      <div className="space-y-6">
        <Tabs defaultValue="problem">
          <TabsList>
            <TabsTrigger value="problem">{t("practice.problemTab")}</TabsTrigger>
            <TabsTrigger value="editorial">{t("practice.editorial.tab")}</TabsTrigger>
            <TabsTrigger value="accepted-solutions">{t("practice.acceptedSolutions.title")}</TabsTrigger>
            <TabsTrigger value="discussion">{t("practice.discussion.title")}</TabsTrigger>
          </TabsList>
          <TabsContent value="problem" className="mt-4">
            <div className={session?.user ? "grid grid-cols-1 gap-6 lg:grid-cols-2" : "space-y-6"}>
              <div className="space-y-6">
                <PublicProblemDetail
                  backHref={buildLocalePath("/practice", locale)}
                  backLabel={tCommon("back")}
                  title={problem.title}
                  description={problem.description}
                  authorLabel={tProblems("badges.author", { name: problem.author?.name ?? t("practice.unknownAuthor") })}
                  tags={problem.problemTags.map((entry) => ({ name: entry.tag.name, color: entry.tag.color }))}
                  timeLimitLabel={tProblems("badges.timeLimit", { value: problem.timeLimitMs ?? 2000 })}
                  memoryLimitLabel={tProblems("badges.memoryLimit", { value: problem.memoryLimitMb ?? 256 })}
                  difficultyTier={getProblemTierInfo(problem.difficulty)}
                  difficultyLabel={
                    problem.difficulty != null
                      ? problem.difficulty.toFixed(2).replace(/\.?0+$/, "")
                      : null
                  }
                  submitAction={session?.user ? (
                    <Link href="#public-submit-panel">
                      <Button>{tProblems("submitSolution")}</Button>
                    </Link>
                  ) : null}
                  editAction={caps.has("problems.create") ? (
                    <Link href={buildLocalePath(`/dashboard/problems/${problem.id}/edit`, locale)}>
                      <Button variant="outline">{tProblems("editProblem")}</Button>
                    </Link>
                  ) : null}
                  playgroundHref={contestlessPlaygroundHref}
                  playgroundLabel={t("practice.tryInPlayground")}
                  signInHref={signInHref}
                  signInLabel={t("practice.signInToSubmit")}
                />

                {/* Problem Statistics */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t("practice.stats.title")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold">{totalSubmissions}</div>
                        <div className="text-xs text-muted-foreground">{t("practice.stats.totalSubmissions")}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">{acceptedCount}</div>
                        <div className="text-xs text-muted-foreground">{t("practice.stats.acceptedCount")}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">{acceptanceRate}%</div>
                        <div className="text-xs text-muted-foreground">{t("practice.stats.acceptanceRate")}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">{uniqueSolvers}</div>
                        <div className="text-xs text-muted-foreground">{t("practice.stats.uniqueSolvers")}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-center">
                      <Link href={buildLocalePath(`/practice/problems/${problem.id}/rankings`, locale)}>
                        <Button variant="outline" size="sm">{tRankings("viewRankings")}</Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>

                {/* Similar Problems */}
                {similarProblems.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t("practice.similarProblems")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {similarProblems.map((sp) => {
                          const problemTier = getProblemTierInfo(sp.difficulty);

                          return (
                            <li key={sp.id} className="flex items-center gap-2">
                              <span className="font-mono text-sm text-muted-foreground w-10">
                                {sp.sequenceNumber ?? ""}
                              </span>
                              <Link
                                href={buildLocalePath(`/practice/problems/${sp.id}`, locale)}
                                className="text-sm font-medium hover:text-primary hover:underline"
                              >
                                {sp.title}
                              </Link>
                              {sp.difficulty != null && (
                                <div className="flex items-center gap-1">
                                  {problemTier ? (
                                    <TierBadge tier={problemTier.tier} label={problemTier.label} />
                                  ) : null}
                                  <Badge variant="secondary" className="text-xs">
                                    {sp.difficulty.toFixed(2).replace(/\.?0+$/, "")}
                                  </Badge>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>

              {session?.user ? (
                <div className="space-y-6">
                  <Card id="public-submit-panel" className="sticky top-6">
                    <CardHeader>
                      <CardTitle>{tProblems("submitSolution")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <PublicQuickSubmit
                        userId={session.user.id}
                        problemId={problem.id}
                        problemTitle={problem.title}
                        languages={enabledLanguages}
                        preferredLanguage={session.user.preferredLanguage ?? null}
                        problemDefaultLanguage={problem.defaultLanguage ?? null}
                        siteDefaultLanguage={settings.defaultLanguage ?? null}
                        editorTheme={session.user.editorTheme ?? null}
                        layout="inline"
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t("practice.mySubmissionsTab")}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {userSubmissions.length === 0 ? (
                        <p className="px-6 py-5 text-sm text-muted-foreground">{t("practice.noMySubmissions")}</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{tSubmissions("table.id")}</TableHead>
                                <TableHead>{tSubmissions("table.language")}</TableHead>
                                <TableHead>{tSubmissions("table.status")}</TableHead>
                                <TableHead>{tSubmissions("table.score")}</TableHead>
                                <TableHead>{tSubmissions("table.submittedAt")}</TableHead>
                                <TableHead>{tSubmissions("table.action")}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {userSubmissions.map((sub) => (
                                <TableRow key={sub.id}>
                                  <TableCell className="font-mono text-xs">
                                    <Link href={buildLocalePath(`/submissions/${sub.id}`, locale)} className="text-primary hover:underline">
                                      {formatSubmissionIdPrefix(sub.id)}
                                    </Link>
                                  </TableCell>
                                  <TableCell>{getLanguageDisplayLabel(sub.language)}</TableCell>
                                  <TableCell>
                                    <SubmissionStatusBadge
                                      label={statusLabels[sub.status as keyof typeof statusLabels] ?? sub.status}
                                      status={sub.status}
                                      executionTimeMs={sub.executionTimeMs}
                                      memoryUsedKb={sub.memoryUsedKb}
                                      score={sub.score}
                                      failedTestCaseIndex={sub.failedTestCaseIndex}
                                      runtimeErrorType={sub.runtimeErrorType}
                                      timeLimitMs={problem.timeLimitMs ?? null}
                                    />
                                  </TableCell>
                                  <TableCell>{sub.score !== null ? Math.round(sub.score * 100) / 100 : "-"}</TableCell>
                                  <TableCell>
                                    {sub.submittedAt
                                      ? formatDateTimeInTimeZone(sub.submittedAt, locale, timeZone)
                                      : "-"}
                                  </TableCell>
                                  <TableCell>
                                    <Link href={buildLocalePath(`/submissions/${sub.id}`, locale)}>
                                      <Button variant="outline" size="sm">{tCommon("view")}</Button>
                                    </Link>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : null}
            </div>
          </TabsContent>

          {/* Editorial tab */}
          <TabsContent value="editorial" className="mt-4 space-y-6">
            <h2 className="text-lg font-semibold">{t("practice.editorial.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("practice.editorial.description")}</p>

            {editorials.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  {t("practice.editorial.empty")}
                </CardContent>
              </Card>
            ) : (
              editorials.map((editorial) => (
                <Card key={editorial.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{editorial.title}</CardTitle>
                        <div className="text-xs text-muted-foreground">
                          {editorial.author?.name ?? t("practice.unknownAuthor")}
                          {editorial.createdAt && (
                            <> · {new Date(editorial.createdAt).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })}</>
                          )}
                        </div>
                      </div>
                      <DiscussionVoteButtons
                        targetType="thread"
                        targetId={editorial.id}
                        score={editorial.voteScore}
                        currentUserVote={editorial.currentUserVote}
                        canVote={Boolean(session?.user) && editorial.authorId !== session?.user?.id}
                        upvoteLabel={t("community.upvote")}
                        downvoteLabel={t("community.downvote")}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                      <AssistantMarkdown content={editorial.content} />
                    </div>
                    {editorial.posts.length > 0 && (
                      <div className="mt-6 border-t pt-4">
                        <h3 className="text-sm font-semibold mb-2">{t("community.repliesTitle")} ({editorial.posts.length})</h3>
                        <div className="space-y-3">
                          {editorial.posts.map((post) => (
                            <div key={post.id} className="rounded-md bg-muted/50 p-3">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <div className="text-xs text-muted-foreground">
                                  {post.author?.name ?? t("community.unknownAuthor")}
                                </div>
                                <DiscussionVoteButtons
                                  targetType="post"
                                  targetId={post.id}
                                  score={post.voteScore}
                                  currentUserVote={post.currentUserVote}
                                  canVote={Boolean(session?.user) && post.author?.id !== session?.user?.id}
                                  upvoteLabel={t("community.upvote")}
                                  downvoteLabel={t("community.downvote")}
                                />
                              </div>
                              <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                                <AssistantMarkdown content={post.content} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}

            {/* Create editorial form for admin/instructor */}
            {session?.user && caps.has("problems.edit") && (
              <DiscussionThreadForm
                scopeType="editorial"
                problemId={problem.id}
                titleLabel={t("practice.editorial.createTitle")}
                contentLabel={t("practice.editorial.createContent")}
                submitLabel={t("practice.editorial.submitLabel")}
                successLabel={t("practice.editorial.success")}
                signInLabel=""
                canPost={true}
                signInHref=""
              />
            )}
          </TabsContent>

          <TabsContent value="accepted-solutions" className="mt-4 space-y-6">
            <h2 className="text-lg font-semibold">{t("practice.acceptedSolutions.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("practice.acceptedSolutions.description")}</p>
            <AcceptedSolutions
              problemId={problem.id}
              languages={enabledLanguages}
            />
          </TabsContent>

          <TabsContent value="discussion" className="mt-4 space-y-6">
            <Tabs defaultValue="questions">
              <TabsList>
                <TabsTrigger value="questions">{t("practice.discussion.questionsTitle")}</TabsTrigger>
                <TabsTrigger value="solutions">{t("practice.discussion.solutionsTitle")}</TabsTrigger>
              </TabsList>
              <TabsContent value="questions" className="mt-4 space-y-6">
                <DiscussionThreadForm
                  scopeType="problem"
                  problemId={problem.id}
                  titleLabel={t("practice.discussion.form.titleLabel")}
                  contentLabel={t("practice.discussion.form.contentLabel")}
                  submitLabel={t("practice.discussion.form.submitLabel")}
                  successLabel={t("practice.discussion.form.success")}
                  signInLabel={t("practice.discussion.form.signIn")}
                  canPost={Boolean(session?.user)}
                  signInHref={buildLocalePath(`/login?callbackUrl=${encodeURIComponent(problemPageHref)}`, locale)}
                />
                <DiscussionThreadList
                  title={t("practice.discussion.questionsTitle")}
                  description={t("practice.discussion.questionsDescription")}
                  emptyLabel={t("practice.discussion.empty")}
                  openLabel={t("practice.discussion.openThread")}
                  pinnedLabel={t("community.pinned")}
                  lockedLabel={t("community.locked")}
                  locale={locale}
                  threads={threads.map((thread) => ({
                    id: thread.id,
                    title: thread.title,
                    content: thread.content,
                    authorName: thread.author?.name ?? t("community.unknownAuthor"),
                    replyCountLabel: t("community.replyCount", { count: thread.posts.length }),
                    locked: Boolean(thread.lockedAt),
                    pinned: Boolean(thread.pinnedAt),
                    href: buildLocalePath(`/community/threads/${thread.id}`, locale),
                    actions: (
                      <DiscussionVoteButtons
                        targetType="thread"
                        targetId={thread.id}
                        score={thread.voteScore}
                        currentUserVote={thread.currentUserVote}
                        canVote={Boolean(session?.user) && thread.authorId !== session?.user?.id}
                        upvoteLabel={t("community.upvote")}
                        downvoteLabel={t("community.downvote")}
                      />
                    ),
                  }))}
                />
              </TabsContent>
              <TabsContent value="solutions" className="mt-4 space-y-6">
                <DiscussionThreadForm
                  scopeType="solution"
                  problemId={problem.id}
                  titleLabel={t("practice.discussion.solutionForm.titleLabel")}
                  contentLabel={t("practice.discussion.solutionForm.contentLabel")}
                  submitLabel={t("practice.discussion.solutionForm.submitLabel")}
                  successLabel={t("practice.discussion.solutionForm.success")}
                  signInLabel={t("practice.discussion.solutionForm.signIn")}
                  canPost={Boolean(session?.user)}
                  signInHref={buildLocalePath(`/login?callbackUrl=${encodeURIComponent(problemPageHref)}`, locale)}
                />
                <DiscussionThreadList
                  title={t("practice.discussion.solutionsTitle")}
                  description={t("practice.discussion.solutionsDescription")}
                  emptyLabel={t("practice.discussion.solutionsEmpty")}
                  openLabel={t("practice.discussion.openThread")}
                  pinnedLabel={t("community.pinned")}
                  lockedLabel={t("community.locked")}
                  locale={locale}
                  threads={solutionThreads.map((thread) => ({
                    id: thread.id,
                    title: thread.title,
                    content: thread.content,
                    authorName: thread.author?.name ?? t("community.unknownAuthor"),
                    replyCountLabel: t("community.replyCount", { count: thread.posts.length }),
                    locked: Boolean(thread.lockedAt),
                    pinned: Boolean(thread.pinnedAt),
                    href: buildLocalePath(`/community/threads/${thread.id}`, locale),
                    actions: (
                      <DiscussionVoteButtons
                        targetType="thread"
                        targetId={thread.id}
                        score={thread.voteScore}
                        currentUserVote={thread.currentUserVote}
                        canVote={Boolean(session?.user) && thread.authorId !== session?.user?.id}
                        upvoteLabel={t("community.upvote")}
                        downvoteLabel={t("community.downvote")}
                      />
                    ),
                  }))}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
