import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { problems, problemGroupAccess, enrollments } from "@/lib/db/schema";
import { eq, desc, sql, and, or } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden, isInstructor, isAdmin, csrfForbidden } from "@/lib/api/auth";
import { recordAuditEvent } from "@/lib/audit/events";
import { createProblemWithTestCases } from "@/lib/problem-management";
import { problemMutationSchema, problemVisibilityValues } from "@/lib/validators/problem-management";
import { checkApiRateLimit, recordApiRateHit } from "@/lib/security/api-rate-limit";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;
    const visibility = searchParams.get("visibility");

    if (visibility && !problemVisibilityValues.includes(visibility as (typeof problemVisibilityValues)[number])) {
      return NextResponse.json({ error: "invalidVisibility" }, { status: 400 });
    }

    const visibilityFilter = visibility ? eq(problems.visibility, visibility) : undefined;

    if (isAdmin(user.role)) {
      const [total] = await db
        .select({ count: sql<number>`count(*)` })
        .from(problems)
        .where(visibilityFilter);

      const results = await db
        .select()
        .from(problems)
        .where(visibilityFilter)
        .orderBy(desc(problems.createdAt))
        .limit(limit)
        .offset(offset);

      return NextResponse.json({ data: results, page, limit, total: Number(total?.count ?? 0) });
    }

    const accessFilter = or(
      eq(problems.visibility, "public"),
      eq(problems.authorId, user.id),
      sql`exists (
        select 1
        from ${problemGroupAccess}
        inner join ${enrollments}
          on ${problemGroupAccess.groupId} = ${enrollments.groupId}
        where ${problemGroupAccess.problemId} = ${problems.id}
          and ${enrollments.userId} = ${user.id}
      )`
    );
    const whereClause = visibilityFilter ? and(accessFilter, visibilityFilter) : accessFilter;

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(problems)
      .where(whereClause);

    const paginatedProblems = await db
      .select()
      .from(problems)
      .where(whereClause)
      .orderBy(desc(problems.createdAt))
      .limit(limit)
      .offset(offset);

    const total = Number(totalRow?.count ?? 0);

    return NextResponse.json({ data: paginatedProblems, page, limit, total });
  } catch (error) {
    console.error("GET /api/v1/problems error:", error);
    return NextResponse.json({ error: "internalServerError" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();
    if (!isInstructor(user.role)) return forbidden();

    const body = await request.json();
    const parsedInput = problemMutationSchema.safeParse({
      title: body.title,
      description: body.description ?? "",
      timeLimitMs: body.timeLimitMs ?? 2000,
      memoryLimitMb: body.memoryLimitMb ?? 256,
      visibility: body.visibility ?? "private",
      testCases: body.testCases ?? [],
    });

    if (!parsedInput.success) {
      return NextResponse.json(
        { error: parsedInput.error.issues[0]?.message ?? "createError" },
        { status: 400 }
      );
    }

    const id = createProblemWithTestCases(parsedInput.data, user.id);

    const problem = await db.query.problems.findFirst({
      where: eq(problems.id, id),
      with: {
        testCases: true,
      },
    });

    if (problem) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "problem.created",
        resourceType: "problem",
        resourceId: problem.id,
        resourceLabel: problem.title,
        summary: `Created problem \"${problem.title}\"`,
        details: {
          visibility: problem.visibility,
          timeLimitMs: problem.timeLimitMs,
          memoryLimitMb: problem.memoryLimitMb,
          testCaseCount: problem.testCases.length,
        },
        request,
      });
    }

    return NextResponse.json({ data: problem }, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/problems error:", error);
    return NextResponse.json({ error: "createError" }, { status: 500 });
  }
}
