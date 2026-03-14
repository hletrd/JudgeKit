import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql, and, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMessages, users } from "@/lib/db/schema";
import { getApiUser, unauthorized, forbidden, isAdmin } from "@/lib/api/auth";

export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();
  if (!isAdmin(user.role)) return forbidden();

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const sessionId = url.searchParams.get("sessionId");
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  if (sessionId) {
    // Get messages for a specific session
    const messages = await db.query.chatMessages.findMany({
      where: eq(chatMessages.sessionId, sessionId),
      orderBy: [asc(chatMessages.createdAt)],
      with: {
        user: { columns: { id: true, name: true, username: true } },
      },
    });
    return NextResponse.json({ messages });
  }

  // Get session list (grouped by sessionId)
  const filters = [];
  if (userId) {
    filters.push(eq(chatMessages.userId, userId));
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const sessions = await db
    .select({
      sessionId: chatMessages.sessionId,
      userId: chatMessages.userId,
      problemId: chatMessages.problemId,
      provider: chatMessages.provider,
      model: chatMessages.model,
      messageCount: sql<number>`count(*)`,
      firstMessage: sql<string>`min(${chatMessages.content})`,
      startedAt: sql<string>`min(${chatMessages.createdAt})`,
      lastMessageAt: sql<string>`max(${chatMessages.createdAt})`,
      userName: users.name,
      username: users.username,
    })
    .from(chatMessages)
    .leftJoin(users, eq(chatMessages.userId, users.id))
    .where(whereClause)
    .groupBy(chatMessages.sessionId)
    .orderBy(desc(sql`max(${chatMessages.createdAt})`))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(distinct ${chatMessages.sessionId})` })
    .from(chatMessages)
    .where(whereClause);

  return NextResponse.json({ sessions, total: Number(total), page, limit });
}
