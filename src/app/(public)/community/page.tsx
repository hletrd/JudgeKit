import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { DiscussionThreadList } from "@/components/discussions/discussion-thread-list";
import { listGeneralDiscussionThreads } from "@/lib/discussions/data";
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
    title: tShell("community.liveTitle"),
    description: tShell("community.liveDescription"),
    path: "/community",
    siteTitle: settings.siteTitle,
    locale,
    keywords: [
      "programming community",
      "coding discussions",
      "developer forum",
    ],
    section: tShell("nav.community"),
  });
}

export default async function CommunityPage() {
  const [t, session, threads, locale] = await Promise.all([
    getTranslations("publicShell"),
    auth(),
    listGeneralDiscussionThreads(),
    getLocale(),
  ]);
  const communityJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("community.liveTitle"),
    description: t("community.liveDescription"),
    url: buildAbsoluteUrl(buildLocalePath("/community", locale)),
    inLanguage: locale,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: threads.map((thread, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: buildAbsoluteUrl(buildLocalePath(`/community/threads/${thread.id}`, locale)),
        name: thread.title,
        description: summarizeTextForMetadata(thread.content, 140),
      })),
    },
  };

  return (
    <>
      <JsonLd data={communityJsonLd} />
      <div className="space-y-6">
        {session?.user ? (
          <div className="flex justify-end">
            <Link href={buildLocalePath("/community/new", locale)}>
              <Button>{t("community.createThread")}</Button>
            </Link>
          </div>
        ) : (
          <Link
            href={buildLocalePath(`/login?callbackUrl=${encodeURIComponent(buildLocalePath("/community", locale))}`, locale)}
            className="block rounded-2xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="font-medium text-primary hover:underline">{t("community.form.signIn")}</span>
          </Link>
        )}
        <DiscussionThreadList
          title={t("community.liveTitle")}
          description={t("community.liveDescription")}
          emptyLabel={t("community.empty")}
          openLabel={t("community.openThread")}
          pinnedLabel={t("community.pinned")}
          lockedLabel={t("community.locked")}
          threads={threads.map((thread) => ({
            id: thread.id,
            title: thread.title,
            content: thread.content,
            authorName: thread.author?.name ?? t("community.unknownAuthor"),
            replyCountLabel: t("community.replyCount", { count: thread.posts.length }),
            locked: Boolean(thread.lockedAt),
            pinned: Boolean(thread.pinnedAt),
            href: buildLocalePath(`/community/threads/${thread.id}`, locale),
          }))}
        />
      </div>
    </>
  );
}
