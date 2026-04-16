import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { problemSets, submissions } from "@/lib/db/schema";

export type PublicProblemSetListItem = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  creator: { id: string; name: string | null; username: string | null } | null;
  publicProblemCount: number;
};

export type PublicProblemSetDetail = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  creator: { id: string; name: string | null; username: string | null } | null;
  problems: Array<{
    id: string;
    title: string;
    difficulty: number | null;
    solvedByViewer: boolean;
  }>;
};

export async function countPublicProblemSets() {
  const [row] = await db
    .select({ total: count() })
    .from(problemSets)
    .where(eq(problemSets.isPublic, true));

  return Number(row?.total ?? 0);
}

export async function listPublicProblemSets(options: { limit?: number; offset?: number } = {}): Promise<PublicProblemSetListItem[]> {
  const rows = await db.query.problemSets.findMany({
    where: eq(problemSets.isPublic, true),
    with: {
      problems: {
        with: {
          problem: {
            columns: {
              id: true,
              visibility: true,
            },
          },
        },
      },
      creator: {
        columns: { id: true, name: true, username: true },
      },
    },
    orderBy: [desc(problemSets.createdAt)],
    limit: options.limit,
    offset: options.offset,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    createdAt: row.createdAt,
    creator: row.creator,
    publicProblemCount: row.problems.filter((item) => item.problem?.visibility === "public").length,
  }));
}

export async function getPublicProblemSetById(id: string, viewerUserId?: string | null): Promise<PublicProblemSetDetail | null> {
  const row = await db.query.problemSets.findFirst({
    where: and(eq(problemSets.id, id), eq(problemSets.isPublic, true)),
    with: {
      problems: {
        with: {
          problem: {
            columns: {
              id: true,
              title: true,
              visibility: true,
              difficulty: true,
            },
          },
        },
      },
      creator: {
        columns: { id: true, name: true, username: true },
      },
    },
  });

  if (!row) return null;

  const publicProblems = row.problems
    .filter((item) => item.problem?.visibility === "public")
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    .map((item) => ({
      id: item.problem?.id ?? item.problemId,
      title: item.problem?.title ?? "",
      difficulty: item.problem?.difficulty ?? null,
    }));

  let solvedIds = new Set<string>();
  if (viewerUserId && publicProblems.length > 0) {
    const solvedRows = await db
      .select({ problemId: submissions.problemId })
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, viewerUserId),
          eq(submissions.status, "accepted"),
          inArray(submissions.problemId, publicProblems.map((problem) => problem.id)),
        ),
      );
    solvedIds = new Set(solvedRows.map((row) => row.problemId));
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    createdAt: row.createdAt,
    creator: row.creator,
    problems: publicProblems.map((problem) => ({
      ...problem,
      solvedByViewer: solvedIds.has(problem.id),
    })),
  };
}
