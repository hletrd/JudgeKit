import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DiscussionModerationList } from "@/components/discussions/discussion-moderation-list";
import { listModerationDiscussionThreads, type DiscussionModerationScope, type DiscussionModerationState } from "@/lib/discussions/data";
import { canModerateDiscussions } from "@/lib/discussions/permissions";
import { Badge } from "@/components/ui/badge";

const SCOPE_VALUES: DiscussionModerationScope[] = ["all", "general", "problem"];
const STATE_VALUES: DiscussionModerationState[] = ["all", "open", "locked", "pinned"];

function normalizeScope(value?: string): DiscussionModerationScope {
  return SCOPE_VALUES.includes(value as DiscussionModerationScope) ? (value as DiscussionModerationScope) : "all";
}

function normalizeState(value?: string): DiscussionModerationState {
  return STATE_VALUES.includes(value as DiscussionModerationState) ? (value as DiscussionModerationState) : "all";
}

function buildFilterHref(scope: DiscussionModerationScope, state: DiscussionModerationState) {
  const params = new URLSearchParams();
  if (scope !== "all") params.set("scope", scope);
  if (state !== "all") params.set("state", state);
  const query = params.toString();
  return query ? `/dashboard/admin/discussions?${query}` : "/dashboard/admin/discussions";
}

export default async function AdminDiscussionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ scope?: string; state?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  if (!(await canModerateDiscussions(session.user.role))) {
    redirect("/dashboard");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const scope = normalizeScope(resolvedSearchParams?.scope);
  const state = normalizeState(resolvedSearchParams?.state);

  const [tModeration, tCommunity] = await Promise.all([
    getTranslations("publicShell.moderation"),
    getTranslations("publicShell.community"),
  ]);
  const threads = await listModerationDiscussionThreads({ scope, state });

  const scopeLabels: Record<DiscussionModerationScope, string> = {
    all: tModeration("scope.all"),
    general: tModeration("scope.general"),
    problem: tModeration("scope.problem"),
  };
  const stateLabels: Record<DiscussionModerationState, string> = {
    all: tModeration("state.all"),
    open: tModeration("state.open"),
    locked: tModeration("state.locked"),
    pinned: tModeration("state.pinned"),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {SCOPE_VALUES.map((value) => (
          <Link key={`scope-${value}`} href={buildFilterHref(value, state)}>
            <Badge variant={scope === value ? "default" : "outline"}>{scopeLabels[value]}</Badge>
          </Link>
        ))}
        {STATE_VALUES.map((value) => (
          <Link key={`state-${value}`} href={buildFilterHref(scope, value)}>
            <Badge variant={state === value ? "default" : "outline"}>{stateLabels[value]}</Badge>
          </Link>
        ))}
      </div>

      <DiscussionModerationList
        title={tModeration("title")}
        description={tModeration("description")}
        emptyLabel={tModeration("empty")}
        items={threads.map((thread) => ({
          id: thread.id,
          title: thread.title,
          authorName: thread.author?.name ?? tModeration("unknownAuthor"),
          scopeLabel: thread.scopeType === "general" ? tModeration("scope.general") : tModeration("scope.problem"),
          statusLabels: [
            ...(thread.pinnedAt ? [tModeration("state.pinned")] : []),
            ...(thread.lockedAt ? [tModeration("state.locked")] : []),
          ],
          metadataLabel:
            thread.scopeType === "problem" && thread.problem
              ? tModeration("problemMeta", { title: thread.problem.title, replies: thread.posts.length })
              : tModeration("generalMeta", { replies: thread.posts.length }),
          openHref: `/community/threads/${thread.id}`,
          openLabel: tModeration("openThread"),
          moderation: {
            isLocked: Boolean(thread.lockedAt),
            isPinned: Boolean(thread.pinnedAt),
            lockLabel: tCommunity("moderation.lock"),
            unlockLabel: tCommunity("moderation.unlock"),
            pinLabel: tCommunity("moderation.pin"),
            unpinLabel: tCommunity("moderation.unpin"),
            deleteLabel: tCommunity("moderation.deleteThread"),
            successLabel: tCommunity("moderation.success"),
            deleteSuccessLabel: tCommunity("moderation.deleteSuccess"),
          },
        }))}
      />
    </div>
  );
}
