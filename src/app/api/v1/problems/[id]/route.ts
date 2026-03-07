import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { problems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden, notFound, isAdmin } from "@/lib/api/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const problem = await db.query.problems.findFirst({ where: eq(problems.id, id) });
    if (!problem) return notFound("Problem");

    return NextResponse.json({ data: problem });
  } catch (error) {
    console.error("GET /api/v1/problems/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const problem = await db.query.problems.findFirst({ where: eq(problems.id, id) });
    if (!problem) return notFound("Problem");

    const isAuthor = problem.authorId === user.id;
    if (!isAuthor && !isAdmin(user.role)) return forbidden();

    const body = await request.json();
    const { title, description, timeLimitMs, memoryLimitMb, visibility } = body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (timeLimitMs !== undefined) updates.timeLimitMs = timeLimitMs;
    if (memoryLimitMb !== undefined) updates.memoryLimitMb = memoryLimitMb;
    if (visibility !== undefined) updates.visibility = visibility;

    await db.update(problems).set(updates).where(eq(problems.id, id));

    const updated = await db.query.problems.findFirst({ where: eq(problems.id, id) });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/v1/problems/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const problem = await db.query.problems.findFirst({ where: eq(problems.id, id) });
    if (!problem) return notFound("Problem");

    const isAuthor = problem.authorId === user.id;
    if (!isAuthor && !isAdmin(user.role)) return forbidden();

    await db.delete(problems).where(eq(problems.id, id));
    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("DELETE /api/v1/problems/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
