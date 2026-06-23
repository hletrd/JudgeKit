import type { MetadataRoute } from "next";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, discussionThreads, problems } from "@/lib/db/schema";
import { SUPPORTED_LOCALES } from "@/lib/i18n/constants";
import { buildAbsoluteUrl, buildLocalePath } from "@/lib/seo";

// Prevent static generation — sitemap needs live DB data
export const dynamic = "force-dynamic";

const SITEMAP_BATCH_SIZE = 1000;
const MAX_SITEMAP_URLS = 45000;
const INDEXABLE_TOP_LEVEL_PATHS = [
  { path: "/", changeFrequency: "daily" as const, priority: 1 },
  { path: "/practice", changeFrequency: "daily" as const, priority: 0.9 },
  { path: "/contests", changeFrequency: "daily" as const, priority: 0.8 },
  { path: "/community", changeFrequency: "daily" as const, priority: 0.7 },
  { path: "/playground", changeFrequency: "weekly" as const, priority: 0.7 },
  { path: "/rankings", changeFrequency: "daily" as const, priority: 0.6 },
] as const;

function buildLocalizedSitemapEntries(
  path: string,
  options: Pick<MetadataRoute.Sitemap[number], "changeFrequency" | "priority" | "lastModified">,
) {
  return SUPPORTED_LOCALES.map((locale) => ({
    url: buildAbsoluteUrl(buildLocalePath(path, locale)),
    lastModified: options.lastModified,
    changeFrequency: options.changeFrequency,
    priority: options.priority,
  }));
}

async function appendLocalizedEntriesInBatches<T extends { id: string; updatedAt: Date | null }>(
  entries: MetadataRoute.Sitemap,
  loader: (offset: number, limit: number) => Promise<T[]>,
  buildPath: (row: T) => string,
  options: Pick<MetadataRoute.Sitemap[number], "changeFrequency" | "priority">,
) {
  for (let offset = 0; entries.length < MAX_SITEMAP_URLS;) {
    const remainingUrlSlots = MAX_SITEMAP_URLS - entries.length;
    const rowLimit = Math.min(
      SITEMAP_BATCH_SIZE,
      Math.floor(remainingUrlSlots / SUPPORTED_LOCALES.length),
    );

    if (rowLimit <= 0) {
      break;
    }

    const batch = await loader(offset, rowLimit);
    for (const row of batch) {
      entries.push(...buildLocalizedSitemapEntries(buildPath(row), {
        ...options,
        lastModified: row.updatedAt ?? undefined,
      }));
    }

    if (batch.length < rowLimit) {
      break;
    }
    offset += rowLimit;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    ...INDEXABLE_TOP_LEVEL_PATHS.flatMap((entry) => buildLocalizedSitemapEntries(entry.path, {
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
      lastModified: undefined,
    })),
  ];

  await appendLocalizedEntriesInBatches(
    entries,
    (offset, limit) => db.query.problems.findMany({
      where: eq(problems.visibility, "public"),
      columns: { id: true, updatedAt: true },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit,
      offset,
    }),
    (problem) => `/practice/problems/${problem.id}`,
    {
      changeFrequency: "weekly",
      priority: 0.8,
    },
  );

  await appendLocalizedEntriesInBatches(
    entries,
    (offset, limit) => db.query.assignments.findMany({
      where: and(eq(assignments.visibility, "public"), ne(assignments.examMode, "none")),
      columns: { id: true, updatedAt: true },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit,
      offset,
    }),
    (contest) => `/contests/${contest.id}`,
    {
      changeFrequency: "daily",
      priority: 0.7,
    },
  );

  await appendLocalizedEntriesInBatches(
    entries,
    (offset, limit) => db.query.discussionThreads.findMany({
      where: eq(discussionThreads.scopeType, "general"),
      columns: { id: true, updatedAt: true },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit,
      offset,
    }),
    (thread) => `/community/threads/${thread.id}`,
    {
      changeFrequency: "weekly",
      priority: 0.6,
    },
  );

  return entries;
}
