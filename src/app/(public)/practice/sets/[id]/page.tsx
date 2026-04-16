import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { PublicProblemSetDetail } from "@/components/problem/public-problem-set-detail";
import { buildLocalePath, buildPublicMetadata, NO_INDEX_METADATA } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { getProblemTierInfo } from "@/lib/problem-tiers";
import { getPublicProblemSetById } from "@/lib/problem-sets/public";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [tCommon, tShell, locale, set] = await Promise.all([
    getTranslations("common"),
    getTranslations("publicShell"),
    getLocale(),
    getPublicProblemSetById(id),
  ]);

  if (!set) {
    return NO_INDEX_METADATA;
  }

  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  return buildPublicMetadata({
    title: set.name,
    description: set.description ?? tShell("practice.sets.description"),
    path: `/practice/sets/${id}`,
    siteTitle: settings.siteTitle,
    locale,
    section: tShell("nav.practice"),
  });
}

export default async function PracticeSetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tCommon, session, locale] = await Promise.all([
    getTranslations("publicShell"),
    getTranslations("common"),
    auth(),
    getLocale(),
  ]);

  const set = await getPublicProblemSetById(id, session?.user?.id ?? null);
  if (!set) notFound();

  const firstUnsolved = set.problems.find((problem) => !problem.solvedByViewer) ?? set.problems[0] ?? null;

  return (
    <PublicProblemSetDetail
      backHref={buildLocalePath("/practice/sets", locale)}
      backLabel={tCommon("back")}
      title={set.name}
      description={set.description}
      creatorLabel={set.creator?.name ?? set.creator?.username ?? t("practice.unknownAuthor")}
      publicProblemCountLabel={t("practice.sets.problemCount", { count: set.problems.length })}
      problemsTitle={t("practice.sets.problemsTitle")}
      noProblemsLabel={t("practice.sets.empty")}
      solveNextHref={firstUnsolved ? buildLocalePath(`/practice/problems/${firstUnsolved.id}`, locale) : null}
      solveNextLabel={t("practice.sets.solveNext")}
      problems={set.problems.map((problem) => ({
        id: problem.id,
        href: buildLocalePath(`/practice/problems/${problem.id}`, locale),
        title: problem.title,
        difficultyLabel: problem.difficulty != null
          ? getProblemTierInfo(problem.difficulty)?.label ?? problem.difficulty.toFixed(2)
          : null,
        solvedByViewer: problem.solvedByViewer,
      }))}
    />
  );
}
