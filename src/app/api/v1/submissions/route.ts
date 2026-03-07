import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getApiUser, unauthorized, isAdmin } from "@/lib/api/auth";
import { nanoid } from "nanoid";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;
    const problemId = searchParams.get("problemId");
    const status = searchParams.get("status");

    let results;

    if (isAdmin(user.role)) {
      results = await db.query.submissions.findMany({
        orderBy: [desc(submissions.submittedAt)],
        limit,
        offset,
      });
    } else {
      results = await db.query.submissions.findMany({
        where: eq(submissions.userId, user.id),
        orderBy: [desc(submissions.submittedAt)],
        limit,
        offset,
      });
    }

    if (problemId) {
      results = results.filter((s) => s.problemId === problemId);
    }
    if (status) {
      results = results.filter((s) => s.status === status);
    }

    return NextResponse.json({ data: results, page, limit });
  } catch (error) {
    console.error("GET /api/v1/submissions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const body = await request.json();
    const { problemId, language, sourceCode, assignmentId } = body;

    if (!problemId || typeof problemId !== "string") {
      return NextResponse.json({ error: "problemId is required" }, { status: 400 });
    }
    if (!language || typeof language !== "string") {
      return NextResponse.json({ error: "language is required" }, { status: 400 });
    }
    if (!sourceCode || typeof sourceCode !== "string") {
      return NextResponse.json({ error: "sourceCode is required" }, { status: 400 });
    }

    const id = nanoid();
    await db.insert(submissions).values({
      id,
      userId: user.id,
      problemId,
      language,
      sourceCode,
      assignmentId: assignmentId || null,
      status: "pending",
      submittedAt: new Date(),
    });

    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
    });
    return NextResponse.json({ data: submission }, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/submissions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
