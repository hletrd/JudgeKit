import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { communityVotes, discussionPosts, discussionThreads, problems } from "@/lib/db/schema";
import { canAccessProblem } from "@/lib/auth/permissions";

export async function canReadProblemDiscussion(problemId: string, viewer?: { userId: string; role: string } | null) {
  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, problemId),
    columns: { id: true, visibility: true },
  });

  if (!problem) return false;
  if (problem.visibility === "public") return true;
  if (!viewer) return false;
  return canAccessProblem(problemId, viewer.userId, viewer.role);
}

type VoteSummary = {
  score: number;
  currentUserVote: "up" | "down" | null;
};

async function listVoteSummaries(targetType: "thread" | "post", targetIds: string[], viewerUserId?: string | null) {
  if (targetIds.length === 0) {
    return new Map<string, VoteSummary>();
  }

  const rows = await db
    .select({
      targetId: communityVotes.targetId,
      score: sql<number>`coalesce(sum(case when ${communityVotes.voteType} = 'up' then 1 when ${communityVotes.voteType} = 'down' then -1 else 0 end), 0)`,
      currentUserVote: viewerUserId
        ? sql<"up" | "down" | null>`max(case when ${communityVotes.userId} = ${viewerUserId} then ${communityVotes.voteType} else null end)`
        : sql<"up" | "down" | null>`null`,
    })
    .from(communityVotes)
    .where(
      and(
        eq(communityVotes.targetType, targetType),
        inArray(communityVotes.targetId, targetIds),
      ),
    )
    .groupBy(communityVotes.targetId);

  return new Map(
    rows.map((row) => [
      row.targetId,
      {
        score: Number(row.score ?? 0),
        currentUserVote: row.currentUserVote ?? null,
      },
    ]),
  );
}

/**
 * Reply counts per thread via a single aggregate, instead of eager-loading every
 * post row just to take `.length`. Mirrors listVoteSummaries' batched pattern.
 */
async function listReplyCounts(threadIds: string[]): Promise<Map<string, number>> {
  if (threadIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({
      threadId: discussionPosts.threadId,
      count: sql<number>`count(*)`,
    })
    .from(discussionPosts)
    .where(inArray(discussionPosts.threadId, threadIds))
    .groupBy(discussionPosts.threadId);
  return new Map(rows.map((row) => [row.threadId, Number(row.count ?? 0)]));
}

function withReplyCounts<T extends { id: string }>(threads: T[], counts: Map<string, number>) {
  return threads.map((thread) => ({ ...thread, replyCount: counts.get(thread.id) ?? 0 }));
}

function withThreadVotes<T extends { id: string }>(threads: T[], summaries: Map<string, VoteSummary>) {
  return threads.map((thread) => ({
    ...thread,
    voteScore: summaries.get(thread.id)?.score ?? 0,
    currentUserVote: summaries.get(thread.id)?.currentUserVote ?? null,
  }));
}

function withPostVotes<T extends { id: string }>(posts: T[], summaries: Map<string, VoteSummary>) {
  return posts.map((post) => ({
    ...post,
    voteScore: summaries.get(post.id)?.score ?? 0,
    currentUserVote: summaries.get(post.id)?.currentUserVote ?? null,
  }));
}

/**
 * Shared comparator for discussion threads: pinned first, then by voteScore
 * descending, then by updatedAt descending. Used by all thread list functions
 * to keep sort order consistent and DRY.
 */
function compareThreadsByPinnedVoteScoreDate(
  left: { pinnedAt: Date | null; voteScore: number; updatedAt: Date | string },
  right: { pinnedAt: Date | null; voteScore: number; updatedAt: Date | string },
) {
  const leftPinned = left.pinnedAt ? 1 : 0;
  const rightPinned = right.pinnedAt ? 1 : 0;
  if (leftPinned !== rightPinned) return rightPinned - leftPinned;
  if (left.voteScore !== right.voteScore) return right.voteScore - left.voteScore;
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

export async function listGeneralDiscussionThreads(sort: "newest" | "popular" = "newest", viewerUserId?: string | null) {
  const threads = await db.query.discussionThreads.findMany({
    where: eq(discussionThreads.scopeType, "general"),
    with: {
      author: { columns: { id: true, name: true, role: true } },
    },
    orderBy: [desc(discussionThreads.pinnedAt), desc(discussionThreads.updatedAt)],
    limit: 50,
  });

  const threadIds = threads.map((thread) => thread.id);
  const [voteSummaries, replyCounts] = await Promise.all([
    listVoteSummaries("thread", threadIds, viewerUserId),
    listReplyCounts(threadIds),
  ]);
  const withVotes = withReplyCounts(withThreadVotes(threads, voteSummaries), replyCounts);

  if (sort === "popular") {
    return withVotes.sort(compareThreadsByPinnedVoteScoreDate);
  }

  return withVotes;
}

/**
 * List every problem-scoped (questions) and solution-scoped (solutions)
 * discussion thread across all problems the viewer can access. Used by
 * the community "Problem talk" tab to give a single place to scan
 * discussion activity instead of opening each problem page one by one.
 *
 * Visibility:
 * - threads on public problems are always included
 * - threads on private/hidden problems are included only if the viewer
 *   passes canAccessProblem (instructors/admins/recruiting candidates
 *   on the right token, problem authors, and group members)
 * - guests (no viewer) see only public-problem threads
 *
 * Sort: pinned first, then either by vote score (`popular`) or by
 * updatedAt (`newest`), matching the general-community list.
 */
export async function listAllProblemDiscussionThreads(
  sort: "newest" | "popular" = "newest",
  viewer?: { userId: string; role: string } | null,
) {
  const threads = await db.query.discussionThreads.findMany({
    where: and(
      inArray(discussionThreads.scopeType, ["problem", "solution"]),
      isNotNull(discussionThreads.problemId),
    ),
    with: {
      author: { columns: { id: true, name: true, role: true } },
      problem: { columns: { id: true, title: true, visibility: true } },
    },
    orderBy: [desc(discussionThreads.pinnedAt), desc(discussionThreads.updatedAt)],
    limit: 200,
  });

  const publicThreads = threads.filter((thread) => thread.problem?.visibility === "public");
  let visible = publicThreads;

  if (viewer) {
    const nonPublic = threads.filter((thread) => thread.problem && thread.problem.visibility !== "public");
    const uniqueProblemIds = Array.from(new Set(nonPublic.map((thread) => thread.problem!.id)));
    const accessible = new Set<string>();
    // Bulk visibility check — canAccessProblem hits 1-2 small queries per id;
    // batching the threads' distinct problems caps total work at #threads
    // problems rather than #threads. For private/hidden problems this is
    // typically a single-digit count anyway.
    await Promise.all(uniqueProblemIds.map(async (problemId) => {
      if (await canAccessProblem(problemId, viewer.userId, viewer.role)) {
        accessible.add(problemId);
      }
    }));
    visible = visible.concat(nonPublic.filter((thread) => thread.problem && accessible.has(thread.problem.id)));
  }

  const visibleIds = visible.map((thread) => thread.id);
  const [voteSummaries, replyCounts] = await Promise.all([
    listVoteSummaries("thread", visibleIds, viewer?.userId),
    listReplyCounts(visibleIds),
  ]);
  const withVotes = withReplyCounts(withThreadVotes(visible, voteSummaries), replyCounts);

  if (sort === "popular") {
    return withVotes.sort(compareThreadsByPinnedVoteScoreDate);
  }
  return withVotes.sort((left, right) => {
    const leftPinned = left.pinnedAt ? 1 : 0;
    const rightPinned = right.pinnedAt ? 1 : 0;
    if (leftPinned !== rightPinned) return rightPinned - leftPinned;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export async function listProblemDiscussionThreads(problemId: string, viewerUserId?: string | null) {
  const threads = await db.query.discussionThreads.findMany({
    where: and(eq(discussionThreads.scopeType, "problem"), eq(discussionThreads.problemId, problemId)),
    with: {
      author: { columns: { id: true, name: true, role: true } },
    },
    orderBy: [desc(discussionThreads.pinnedAt), desc(discussionThreads.updatedAt)],
    limit: 50,
  });

  const threadIds = threads.map((thread) => thread.id);
  const [voteSummaries, replyCounts] = await Promise.all([
    listVoteSummaries("thread", threadIds, viewerUserId),
    listReplyCounts(threadIds),
  ]);
  return withReplyCounts(withThreadVotes(threads, voteSummaries), replyCounts).sort(compareThreadsByPinnedVoteScoreDate);
}

export async function listProblemSolutionThreads(problemId: string, viewerUserId?: string | null) {
  const threads = await db.query.discussionThreads.findMany({
    where: and(eq(discussionThreads.scopeType, "solution"), eq(discussionThreads.problemId, problemId)),
    with: {
      author: { columns: { id: true, name: true, role: true } },
    },
    orderBy: [desc(discussionThreads.pinnedAt), desc(discussionThreads.updatedAt)],
    limit: 50,
  });

  const threadIds = threads.map((thread) => thread.id);
  const [voteSummaries, replyCounts] = await Promise.all([
    listVoteSummaries("thread", threadIds, viewerUserId),
    listReplyCounts(threadIds),
  ]);
  return withReplyCounts(withThreadVotes(threads, voteSummaries), replyCounts).sort(compareThreadsByPinnedVoteScoreDate);
}

export async function listProblemEditorials(problemId: string, viewerUserId?: string | null) {
  const threads = await db.query.discussionThreads.findMany({
    where: and(eq(discussionThreads.scopeType, "editorial"), eq(discussionThreads.problemId, problemId)),
    with: {
      author: { columns: { id: true, name: true, role: true } },
      posts: {
        with: { author: { columns: { id: true, name: true, role: true } } },
        orderBy: [discussionPosts.createdAt],
      },
    },
    orderBy: [desc(discussionThreads.pinnedAt), desc(discussionThreads.updatedAt)],
    limit: 10,
  });

  const [threadVotes, postVotes] = await Promise.all([
    listVoteSummaries("thread", threads.map((thread) => thread.id), viewerUserId),
    listVoteSummaries(
      "post",
      threads.flatMap((thread) => thread.posts.map((post) => post.id)),
      viewerUserId,
    ),
  ]);

  return withThreadVotes(threads, threadVotes)
    .map((thread) => ({
      ...thread,
      posts: withPostVotes(thread.posts, postVotes),
    }))
    .sort(compareThreadsByPinnedVoteScoreDate);
}

export async function getDiscussionThreadById(threadId: string, viewerUserId?: string | null) {
  const thread = await db.query.discussionThreads.findFirst({
    where: eq(discussionThreads.id, threadId),
    with: {
      author: { columns: { id: true, name: true, role: true } },
      problem: { columns: { id: true, title: true, visibility: true } },
      posts: {
        with: {
          author: { columns: { id: true, name: true, role: true } },
        },
        orderBy: [discussionPosts.createdAt],
      },
    },
  });

  if (!thread) {
    return null;
  }

  const [threadVotes, postVotes] = await Promise.all([
    listVoteSummaries("thread", [thread.id], viewerUserId),
    listVoteSummaries("post", thread.posts.map((post) => post.id), viewerUserId),
  ]);

  return {
    ...withThreadVotes([thread], threadVotes)[0],
    posts: withPostVotes(thread.posts, postVotes),
  };
}

export async function listUserDiscussionThreads(userId: string) {
  const [authored, participatedPosts] = await Promise.all([
    db.query.discussionThreads.findMany({
      where: eq(discussionThreads.authorId, userId),
      with: {
        author: { columns: { id: true, name: true, role: true } },
        problem: { columns: { id: true, title: true } },
        posts: { columns: { id: true } },
      },
      orderBy: [desc(discussionThreads.updatedAt)],
      limit: 50,
    }),
    db.query.discussionPosts.findMany({
      where: eq(discussionPosts.authorId, userId),
      with: {
        thread: {
          with: {
            author: { columns: { id: true, name: true, role: true } },
            problem: { columns: { id: true, title: true } },
            posts: { columns: { id: true } },
          },
        },
      },
      orderBy: [desc(discussionPosts.updatedAt)],
      limit: 100,
    }),
  ]);

  const byId = new Map<string, (typeof authored)[number] & { participated?: boolean; authoredByViewer?: boolean }>();

  for (const thread of authored) {
    byId.set(thread.id, {
      ...thread,
      participated: false,
      authoredByViewer: true,
    });
  }

  for (const post of participatedPosts) {
    if (!post.thread) continue;
    const existing = byId.get(post.thread.id);
    if (existing) {
      existing.participated = true;
      continue;
    }
    byId.set(post.thread.id, {
      ...post.thread,
      participated: true,
      authoredByViewer: post.thread.authorId === userId,
    });
  }

  return Array.from(byId.values()).sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
}

export type DiscussionModerationScope = "all" | "general" | "problem";
export type DiscussionModerationState = "all" | "open" | "locked" | "pinned";

export async function listModerationDiscussionThreads(options: {
  scope?: DiscussionModerationScope;
  state?: DiscussionModerationState;
} = {}) {
  const scope = options.scope ?? "all";
  const state = options.state ?? "all";

  // Push scope and state filters to the SQL WHERE clause instead of filtering
  // in JavaScript. This leverages the dt_scope_idx index on scopeType and
  // reduces DB I/O by only returning rows that match the requested filters.
  const conditions = [];

  if (scope !== "all") {
    conditions.push(eq(discussionThreads.scopeType, scope));
  }

  if (state === "locked") {
    conditions.push(isNotNull(discussionThreads.lockedAt));
  } else if (state === "pinned") {
    conditions.push(isNotNull(discussionThreads.pinnedAt));
  } else if (state === "open") {
    // "Open" means not locked, regardless of pin status. A thread that is
    // both pinned and locked is still "locked" — pinning is an organizational
    // action, not a state that makes a thread closed.
    conditions.push(isNull(discussionThreads.lockedAt));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  return db.query.discussionThreads.findMany({
    where: whereClause,
    with: {
      author: { columns: { id: true, name: true, role: true } },
      problem: { columns: { id: true, title: true } },
      posts: { columns: { id: true } },
    },
    orderBy: [desc(discussionThreads.pinnedAt), desc(discussionThreads.updatedAt)],
    limit: 100,
  });
}
