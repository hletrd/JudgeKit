import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { DiscussionThreadView } from "@/components/discussions/discussion-thread-view";
import { DiscussionPostForm } from "@/components/discussions/discussion-post-form";
import { DiscussionThreadModerationControls } from "@/components/discussions/discussion-thread-moderation-controls";
import { DiscussionPostDeleteButton } from "@/components/discussions/discussion-post-delete-button";
import { JsonLd } from "@/components/seo/json-ld";
import { canReadProblemDiscussion, getDiscussionThreadById } from "@/lib/discussions/data";
import { canModerateDiscussions } from "@/lib/discussions/permissions";
import { buildAbsoluteUrl, buildLocalePath, buildPublicMetadata, NO_INDEX_METADATA, summarizeTextForMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [thread, t, tShell, locale] = await Promise.all([
    getDiscussionThreadById(id),
    getTranslations("common"),
    getTranslations("publicShell"),
    getLocale(),
  ]);

  if (!thread || (thread.scopeType === "problem" && thread.problem?.visibility !== "public")) {
    return {
      title: tShell("community.liveTitle"),
      ...NO_INDEX_METADATA,
    };
  }

  const settings = await getResolvedSystemSettings({
    siteTitle: t("appName"),
    siteDescription: t("appDescription"),
  });

  return buildPublicMetadata({
    title: thread.title,
    description: summarizeTextForMetadata(thread.content),
    path: `/community/threads/${id}`,
    siteTitle: settings.siteTitle,
    locale,
    keywords: [
      "programming discussion",
      thread.scopeType === "general" ? "community forum" : "problem discussion",
    ],
    section: thread.scopeType === "general" ? tShell("nav.community") : tShell("community.scopeProblem"),
    socialBadge:
      thread.scopeType === "general"
        ? tShell("community.scopeGeneral")
        : tShell("community.scopeProblem"),
    socialMeta: [thread.author?.name, tShell("community.replyCount", { count: thread.posts.length })].filter(Boolean).join(" · "),
    type: "article",
  });
}

export default async function CommunityThreadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, session, thread, locale] = await Promise.all([
    getTranslations("publicShell"),
    auth(),
    getDiscussionThreadById(id),
    getLocale(),
  ]);

  if (!thread) {
    notFound();
  }

  if (thread.scopeType === "problem") {
    const canRead = await canReadProblemDiscussion(
      thread.problemId ?? "",
      session?.user ? { userId: session.user.id, role: session.user.role } : null,
    );
    if (!canRead) {
      notFound();
    }
  }

  const canModerate = session?.user ? await canModerateDiscussions(session.user.role) : false;
  const threadJsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: thread.title,
    articleBody: summarizeTextForMetadata(thread.content, 240),
    url: buildAbsoluteUrl(buildLocalePath(`/community/threads/${thread.id}`, locale)),
    inLanguage: locale,
    datePublished: thread.createdAt?.toISOString?.(),
    dateModified: thread.updatedAt?.toISOString?.(),
    author: thread.author?.name
      ? {
          "@type": "Person",
          name: thread.author.name,
        }
      : undefined,
    commentCount: thread.posts.length,
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: t("nav.community"),
        item: buildAbsoluteUrl(buildLocalePath("/community", locale)),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: thread.title,
        item: buildAbsoluteUrl(buildLocalePath(`/community/threads/${thread.id}`, locale)),
      },
    ],
  };
  const callbackPath = buildLocalePath(`/community/threads/${thread.id}`, locale);

  return (
    <>
      <JsonLd data={[threadJsonLd, breadcrumbJsonLd]} />
      <div className="space-y-6">
        {thread.scopeType === "problem" && thread.problem ? (
          <div className="text-sm text-muted-foreground">
            <Link href={buildLocalePath(`/practice/problems/${thread.problem.id}`, locale)} className="font-medium text-primary hover:underline">
              {thread.problem.title}
            </Link>
          </div>
        ) : null}
        {canModerate ? (
          <DiscussionThreadModerationControls
            threadId={thread.id}
            isLocked={Boolean(thread.lockedAt)}
            isPinned={Boolean(thread.pinnedAt)}
            pinLabel={t("community.moderation.pin")}
            unpinLabel={t("community.moderation.unpin")}
            lockLabel={t("community.moderation.lock")}
            unlockLabel={t("community.moderation.unlock")}
            deleteLabel={t("community.moderation.deleteThread")}
            successLabel={t("community.moderation.success")}
            deleteSuccessLabel={t("community.moderation.deleteSuccess")}
          />
        ) : null}
        <DiscussionThreadView
          title={thread.title}
          content={thread.content}
          authorName={thread.author?.name ?? t("community.unknownAuthor")}
          scopeLabel={thread.scopeType === "general" ? t("community.scopeGeneral") : t("community.scopeProblem")}
          repliesTitle={t("community.repliesTitle")}
          noRepliesLabel={t("community.noReplies")}
          posts={thread.posts.map((post) => ({
            id: post.id,
            content: post.content,
            authorName: post.author?.name ?? t("community.unknownAuthor"),
            actions: canModerate ? (
              <DiscussionPostDeleteButton
                postId={post.id}
                deleteLabel={t("community.moderation.deletePost")}
                successLabel={t("community.moderation.replyDeleteSuccess")}
              />
            ) : undefined,
          }))}
        />
        <DiscussionPostForm
          threadId={thread.id}
          contentLabel={t("community.reply.contentLabel")}
          submitLabel={t("community.reply.submitLabel")}
          successLabel={t("community.reply.success")}
          signInLabel={t("community.reply.signIn")}
          canPost={Boolean(session?.user)}
          signInHref={buildLocalePath(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`, locale)}
        />
      </div>
    </>
  );
}
