import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { groups, enrollments } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden, isAdmin, isInstructor, csrfForbidden } from "@/lib/api/auth";
import { recordAuditEvent } from "@/lib/audit/events";
import { nanoid } from "nanoid";
import { createGroupSchema } from "@/lib/validators/groups";
import { checkApiRateLimit, recordApiRateHit } from "@/lib/security/api-rate-limit";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const offset = (page - 1) * limit;

    let results;
    let total = 0;

    if (isAdmin(user.role)) {
      const [totalRow] = await db.select({ count: sql<number>`count(*)` }).from(groups);
      total = Number(totalRow?.count ?? 0);
      results = await db.query.groups.findMany({
        orderBy: [desc(groups.createdAt)],
        limit,
        offset,
        with: {
          instructor: {
            columns: { id: true, name: true, email: true },
          },
        },
      });
    } else if (isInstructor(user.role)) {
      const [totalRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(groups)
        .where(eq(groups.instructorId, user.id));
      total = Number(totalRow?.count ?? 0);
      results = await db.query.groups.findMany({
        where: eq(groups.instructorId, user.id),
        orderBy: [desc(groups.createdAt)],
        limit,
        offset,
        with: {
          instructor: {
            columns: { id: true, name: true, email: true },
          },
        },
      });
    } else {
      const [totalRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(enrollments)
        .where(eq(enrollments.userId, user.id));
      total = Number(totalRow?.count ?? 0);
      const userEnrollments = await db.query.enrollments.findMany({
        where: eq(enrollments.userId, user.id),
        limit,
        offset,
        orderBy: [desc(enrollments.enrolledAt)],
        with: {
          group: {
            with: {
              instructor: {
                columns: { id: true, name: true, email: true },
              },
            },
          },
        },
      });
      results = userEnrollments.map((e) => e.group);
    }

    return NextResponse.json({ data: results, page, limit, total });
  } catch (error) {
    console.error("GET /api/v1/groups error:", error);
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
    const parsedInput = createGroupSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json(
        { error: parsedInput.error.issues[0]?.message ?? "createError" },
        { status: 400 }
      );
    }

    const { name, description } = parsedInput.data;

    const id = nanoid();
    await db.insert(groups).values({
      id,
      name,
      description: description || null,
      instructorId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const group = await db.query.groups.findFirst({ where: eq(groups.id, id) });

    if (group) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "group.created",
        resourceType: "group",
        resourceId: group.id,
        resourceLabel: group.name,
        summary: `Created group \"${group.name}\"`,
        details: {
          isArchived: group.isArchived,
        },
        request,
      });
    }

    return NextResponse.json({ data: group }, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/groups error:", error);
    return NextResponse.json({ error: "createError" }, { status: 500 });
  }
}
