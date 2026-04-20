import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { DiscussionThreadView } from "@/components/discussions/discussion-thread-view";
import { DiscussionPostForm } from "@/components/discussions/discussion-post-form";
import { DiscussionThreadModerationControls } from "@/components/discussions/discussion-thread-moderation-controls";
import { DiscussionPostDeleteButton } from "@/components/discussions/discussion-post-delete-button";
import { DiscussionVoteButtons } from "@/components/discussions/discussion-vote-buttons";
import { JsonLd } from "@/components/seo/json-ld";
import { canReadProblemDiscussion, getDiscussionThreadById } from "@/lib/discussions/data";
import { canModerateDiscussions } from "@/lib/discussions/permissions";
import { buildAbsoluteUrl, buildLocalePath, buildPublicMetadata, buildSocialImageUrl, NO_INDEX_METADATA, summarizeTextForMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [thread, t, tShell, locale] = await Promise.all([
    getDiscussionThreadById(id),
    getTranslations("common"),
    getTranslations("publicShell"),
    getLocale(),
  ]);

  if (!thread || ((thread.scopeType === "problem" || thread.scopeType === "solution") && thread.problem?.visibility !== "public")) {
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
      thread.scopeType === "general"
        ? "community forum"
        : thread.scopeType === "solution"
          ? "solution discussion"
          : "problem discussion",
    ],
    section: thread.scopeType === "general" ? tShell("nav.community") : tShell(`community.${thread.scopeType === "solution" ? "scopeSolution" : "scopeProblem"}`),
    socialBadge:
      thread.scopeType === "general"
        ? tShell("community.scopeGeneral")
        : tShell(thread.scopeType === "solution" ? "community.scopeSolution" : "community.scopeProblem"),
    socialMeta: [thread.author?.name, tShell("community.replyCount", { count: thread.posts.length })].filter(Boolean).join(" · "),
    socialFooter: thread.scopeType === "problem"
      ? thread.problem?.title ?? tShell("nav.community")
      : tShell("nav.community"),
    type: "article",
  });
}

export default async function CommunityThreadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tShell, tCommon, session, locale, settings] = await Promise.all([
    getTranslations("publicShell"),
    getTranslations("common"),
    auth(),
    getLocale(),
    getResolvedSystemSettings({
      siteTitle: "JudgeKit",
      siteDescription: "Online judge",
    }),
  ]);
  const thread = await getDiscussionThreadById(id, session?.user?.id ?? null);

  if (!thread) {
    notFound();
  }

  if (thread.scopeType === "problem" || thread.scopeType === "solution") {
    const canRead = await canReadProblemDiscussion(
      thread.problemId ?? "",
      session?.user ? { userId: session.user.id, role: session.user.role } : null,
    );
    if (!canRead) {
      notFound();
    }
  }

  const canModerate = session?.user ? await canModerateDiscussions(session.user.role) : false;
  const socialImageUrl = buildSocialImageUrl({
    title: thread.title,
    description: summarizeTextForMetadata(thread.content),
    locale,
    siteTitle: settings.siteTitle,
    section: thread.scopeType === "general" ? tShell("nav.community") : tShell(thread.scopeType === "solution" ? "community.scopeSolution" : "community.scopeProblem"),
    badge: thread.scopeType === "general" ? tShell("community.scopeGeneral") : tShell(thread.scopeType === "solution" ? "community.scopeSolution" : "community.scopeProblem"),
    meta: [thread.author?.name, tShell("community.replyCount", { count: thread.posts.length })].filter(Boolean).join(" · "),
    footer: thread.scopeType === "problem" ? thread.problem?.title ?? tShell("nav.community") : tShell("nav.community"),
  });
  const threadJsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: thread.title,
    articleBody: summarizeTextForMetadata(thread.content, 240),
    url: buildAbsoluteUrl(buildLocalePath(`/community/threads/${thread.id}`, locale)),
    mainEntityOfPage: buildAbsoluteUrl(buildLocalePath(`/community/threads/${thread.id}`, locale)),
    inLanguage: locale,
    image: [socialImageUrl],
    datePublished: thread.createdAt?.toISOString?.(),
    dateModified: thread.updatedAt?.toISOString?.(),
    author: thread.author?.name
      ? {
          "@type": "Person",
          name: thread.author.name,
        }
      : undefined,
    publisher: {
      "@type": "Organization",
      name: settings.siteTitle,
    },
    commentCount: thread.posts.length,
    about: thread.scopeType === "problem" && thread.problem?.title
      ? {
          "@type": "Thing",
          name: thread.problem.title,
        }
      : undefined,
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
        name: tShell("nav.community"),
        item: buildAbsoluteUrl(buildLocalePath("/community", locale)),
      },
      {
        "@type": "ListItem",
        position: 3,
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
            pinLabel={tShell("community.moderation.pin")}
            unpinLabel={tShell("community.moderation.unpin")}
            lockLabel={tShell("community.moderation.lock")}
            unlockLabel={tShell("community.moderation.unlock")}
            deleteLabel={tShell("community.moderation.deleteThread")}
            successLabel={tShell("community.moderation.success")}
            deleteSuccessLabel={tShell("community.moderation.deleteSuccess")}
          />
        ) : null}
        <DiscussionThreadView
          title={thread.title}
          content={thread.content}
          authorName={thread.author?.name ?? tShell("community.unknownAuthor")}
          scopeLabel={
            thread.scopeType === "general"
              ? tShell("community.scopeGeneral")
              : thread.scopeType === "solution"
                ? tShell("community.scopeSolution")
                : tShell("community.scopeProblem")
          }
          repliesTitle={tShell("community.repliesTitle")}
          noRepliesLabel={tShell("community.noReplies")}
          locale={locale}
          actions={(
            <DiscussionVoteButtons
              targetType="thread"
              targetId={thread.id}
              score={thread.voteScore}
              currentUserVote={thread.currentUserVote}
              canVote={Boolean(session?.user) && thread.authorId !== session?.user?.id}
              upvoteLabel={tShell("community.upvote")}
              downvoteLabel={tShell("community.downvote")}
            />
          )}
          posts={thread.posts.map((post) => ({
            id: post.id,
            content: post.content,
            authorName: post.author?.name ?? tShell("community.unknownAuthor"),
            actions: (
              <div className="flex items-center gap-2">
                <DiscussionVoteButtons
                  targetType="post"
                  targetId={post.id}
                  score={post.voteScore}
                  currentUserVote={post.currentUserVote}
                  canVote={Boolean(session?.user) && post.author?.id !== session?.user?.id}
                  upvoteLabel={tShell("community.upvote")}
                  downvoteLabel={tShell("community.downvote")}
                />
                {canModerate ? (
                  <DiscussionPostDeleteButton
                    postId={post.id}
                    deleteLabel={tShell("community.moderation.deletePost")}
                    successLabel={tShell("community.moderation.replyDeleteSuccess")}
                  />
                ) : null}
              </div>
            ),
          }))}
        />
        <DiscussionPostForm
          threadId={thread.id}
          contentLabel={tShell("community.reply.contentLabel")}
          submitLabel={tShell("community.reply.submitLabel")}
          successLabel={tShell("community.reply.success")}
          signInLabel={tShell("community.reply.signIn")}
          canPost={Boolean(session?.user)}
          signInHref={buildLocalePath(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`, locale)}
        />
      </div>
    </>
  );
}
