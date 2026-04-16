import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { discussionPosts, discussionThreads, problems } from "@/lib/db/schema";
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

export async function listGeneralDiscussionThreads() {
  return db.query.discussionThreads.findMany({
    where: eq(discussionThreads.scopeType, "general"),
    with: {
      author: { columns: { id: true, name: true, role: true } },
      posts: { columns: { id: true } },
    },
    orderBy: [desc(discussionThreads.pinnedAt), desc(discussionThreads.updatedAt)],
    limit: 50,
  });
}

export async function listProblemDiscussionThreads(problemId: string) {
  return db.query.discussionThreads.findMany({
    where: and(eq(discussionThreads.scopeType, "problem"), eq(discussionThreads.problemId, problemId)),
    with: {
      author: { columns: { id: true, name: true, role: true } },
      posts: { columns: { id: true } },
    },
    orderBy: [desc(discussionThreads.pinnedAt), desc(discussionThreads.updatedAt)],
    limit: 50,
  });
}

export async function listProblemEditorials(problemId: string) {
  return db.query.discussionThreads.findMany({
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
}

export async function getDiscussionThreadById(threadId: string) {
  return db.query.discussionThreads.findFirst({
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

  const threads = await db.query.discussionThreads.findMany({
    with: {
      author: { columns: { id: true, name: true, role: true } },
      problem: { columns: { id: true, title: true } },
      posts: { columns: { id: true } },
    },
    orderBy: [desc(discussionThreads.pinnedAt), desc(discussionThreads.updatedAt)],
    limit: 100,
  });

  return threads.filter((thread) => {
    if (scope !== "all" && thread.scopeType !== scope) {
      return false;
    }
    if (state === "locked" && !thread.lockedAt) {
      return false;
    }
    if (state === "pinned" && !thread.pinnedAt) {
      return false;
    }
    if (state === "open" && (thread.lockedAt || thread.pinnedAt)) {
      return false;
    }
    return true;
  });
}
