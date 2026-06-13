import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { codeSnapshots, problems } from "@/lib/db/schema";
import { and, eq, asc, sql } from "drizzle-orm";
import { createApiHandler } from "@/lib/api/handler";
import { apiError, apiPaginated } from "@/lib/api/responses";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { parsePagination } from "@/lib/api/pagination";

export const GET = createApiHandler({
  auth: { capabilities: ["contests.view_analytics"] },
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId, userId } = params;
    const canView = await canViewAssignmentSubmissions(assignmentId, user.id, user.role);
    if (!canView) {
      return apiError("forbidden", 403);
    }

    const problemId = req.nextUrl.searchParams.get("problemId");
    const { page, limit, offset } = parsePagination(req.nextUrl.searchParams, {
      defaultLimit: 50,
      maxLimit: 200,
    });

    const conditions = [
      eq(codeSnapshots.userId, userId),
      eq(codeSnapshots.assignmentId, assignmentId),
    ];
    if (problemId) {
      conditions.push(eq(codeSnapshots.problemId, problemId));
    }

    const whereClause = and(...conditions);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(codeSnapshots)
      .where(whereClause);
    const total = Number(totalRow?.count ?? 0);

    const snapshots = await db
      .select({
        id: codeSnapshots.id,
        problemId: codeSnapshots.problemId,
        problemTitle: problems.title,
        language: codeSnapshots.language,
        sourceCode: codeSnapshots.sourceCode,
        charCount: codeSnapshots.charCount,
        createdAt: codeSnapshots.createdAt,
      })
      .from(codeSnapshots)
      .leftJoin(problems, eq(problems.id, codeSnapshots.problemId))
      .where(whereClause)
      // Unique `id` tiebreak after the non-unique `created_at` so the
      // offset-paged anti-cheat evidence timeline is deterministic: snapshots
      // are POSTed one row at a time by editor autosave (created_at defaults to
      // new Date()), so rapid edits share a millisecond — without the tiebreak
      // Postgres could reorder equal-timestamp rows per query and drop/dup a
      // snapshot at a page seam (RPF cycle-9 AGG9-1).
      .orderBy(asc(codeSnapshots.createdAt), asc(codeSnapshots.id))
      .limit(limit)
      .offset(offset);

    return apiPaginated(snapshots, page, limit, total);
  },
});
