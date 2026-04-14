import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { DiscussionThreadList } from "@/components/discussions/discussion-thread-list";
import { listGeneralDiscussionThreads } from "@/lib/discussions/data";

export default async function CommunityPage() {
  const [t, session, threads] = await Promise.all([
    getTranslations("publicShell"),
    auth(),
    listGeneralDiscussionThreads(),
  ]);

  return (
    <div className="space-y-6">
      {session?.user ? (
        <div className="flex justify-end">
          <Link href="/community/new">
            <Button>{t("community.createThread")}</Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          <a href="/login?callbackUrl=%2Fcommunity" className="font-medium text-primary hover:underline">
            {t("community.form.signIn")}
          </a>
        </div>
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
          href: `/community/threads/${thread.id}`,
        }))}
      />
    </div>
  );
}
