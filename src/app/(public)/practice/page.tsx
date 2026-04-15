import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { problems } from "@/lib/db/schema";
import { PublicProblemList } from "../_components/public-problem-list";
import { JsonLd } from "@/components/seo/json-ld";
import { buildAbsoluteUrl, buildLocalePath, buildPublicMetadata, summarizeTextForMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";

export async function generateMetadata(): Promise<Metadata> {
  const [tCommon, tShell, locale] = await Promise.all([
    getTranslations("common"),
    getTranslations("publicShell"),
    getLocale(),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  return buildPublicMetadata({
    title: tShell("practice.catalogTitle"),
    description: tShell("practice.catalogDescription"),
    path: "/practice",
    siteTitle: settings.siteTitle,
    locale,
    keywords: [
      "algorithm practice",
      "coding interview problems",
      "programming exercises",
    ],
    section: tShell("nav.practice"),
  });
}

export default async function PracticePage() {
  const [t, locale] = await Promise.all([
    getTranslations("publicShell"),
    getLocale(),
  ]);

  const publicProblems = await db.query.problems.findMany({
    where: eq(problems.visibility, "public"),
    with: {
      author: {
        columns: { name: true },
      },
      problemTags: {
        with: {
          tag: {
            columns: { name: true, color: true },
          },
        },
      },
    },
    orderBy: [asc(problems.sequenceNumber), asc(problems.createdAt)],
    limit: 60,
  });

  const practiceJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("practice.catalogTitle"),
    description: t("practice.catalogDescription"),
    url: buildAbsoluteUrl(buildLocalePath("/practice", locale)),
    inLanguage: locale,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: publicProblems.map((problem, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: buildAbsoluteUrl(buildLocalePath(`/practice/problems/${problem.id}`, locale)),
        name: problem.title,
      })),
    },
  };

  return (
    <>
      <JsonLd data={practiceJsonLd} />
      <PublicProblemList
        title={t("practice.catalogTitle")}
        description={t("practice.catalogDescription")}
        noProblemsLabel={t("practice.noProblems")}
        openProblemLabel={t("practice.openProblem")}
        problems={publicProblems.map((problem) => ({
          id: problem.id,
          title: problem.title,
          summary: summarizeTextForMetadata(problem.description, 180),
          authorName: problem.author?.name ?? t("practice.unknownAuthor"),
          tags: problem.problemTags.map((entry) => ({
            name: entry.tag.name,
            color: entry.tag.color,
          })),
        }))}
      />
    </>
  );
}
