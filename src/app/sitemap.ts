import type { MetadataRoute } from "next";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, discussionThreads, problems } from "@/lib/db/schema";
import { buildAbsoluteUrl } from "@/lib/seo";

// Prevent static generation — sitemap needs live DB data
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [publicProblems, publicContests, generalThreads] = await Promise.all([
    db.query.problems.findMany({
      where: eq(problems.visibility, "public"),
      columns: { id: true, updatedAt: true },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 500,
    }),
    db.query.assignments.findMany({
      where: and(eq(assignments.visibility, "public"), ne(assignments.examMode, "none")),
      columns: { id: true, updatedAt: true },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 500,
    }),
    db.query.discussionThreads.findMany({
      where: eq(discussionThreads.scopeType, "general"),
      columns: { id: true, updatedAt: true },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 200,
    }),
  ]);

  return [
    { url: buildAbsoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: buildAbsoluteUrl("/practice"), changeFrequency: "daily", priority: 0.9 },
    { url: buildAbsoluteUrl("/contests"), changeFrequency: "daily", priority: 0.8 },
    { url: buildAbsoluteUrl("/community"), changeFrequency: "daily", priority: 0.7 },
    { url: buildAbsoluteUrl("/playground"), changeFrequency: "weekly", priority: 0.7 },
    ...publicProblems.map((problem) => ({
      url: buildAbsoluteUrl(`/practice/problems/${problem.id}`),
      lastModified: problem.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...publicContests.map((contest) => ({
      url: buildAbsoluteUrl(`/contests/${contest.id}`),
      lastModified: contest.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...generalThreads.map((thread) => ({
      url: buildAbsoluteUrl(`/community/threads/${thread.id}`),
      lastModified: thread.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
