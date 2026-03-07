import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { problems } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden, isInstructor } from "@/lib/api/auth";
import { nanoid } from "nanoid";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;
    const visibility = searchParams.get("visibility");

    const query = db.select().from(problems).orderBy(desc(problems.createdAt)).limit(limit).offset(offset);

    const allProblems = await query;

    const filtered = visibility
      ? allProblems.filter((p) => p.visibility === visibility)
      : allProblems;

    return NextResponse.json({ data: filtered, page, limit });
  } catch (error) {
    console.error("GET /api/v1/problems error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();
    if (!isInstructor(user.role)) return forbidden();

    const body = await request.json();
    const { title, description, timeLimitMs, memoryLimitMb, visibility } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const id = nanoid();
    await db.insert(problems).values({
      id,
      title: title.trim(),
      description: description || "",
      timeLimitMs: timeLimitMs || 2000,
      memoryLimitMb: memoryLimitMb || 256,
      visibility: visibility || "private",
      authorId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const problem = await db.query.problems.findFirst({ where: eq(problems.id, id) });
    return NextResponse.json({ data: problem }, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/problems error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
