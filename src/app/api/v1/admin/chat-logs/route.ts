import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMessages } from "@/lib/db/schema";
import { forbidden } from "@/lib/api/auth";
import { createApiHandler } from "@/lib/api/handler";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import { rawQueryAll } from "@/lib/db/queries";
import { parsePositiveInt } from "@/lib/validators/query-params";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("system.chat_logs")) return forbidden();

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const sessionId = url.searchParams.get("sessionId");
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const limit = 50;
    const offset = (page - 1) * limit;

    if (sessionId) {
      // Get messages for a specific session.
      // Transcript access is a privileged operation — the audit event below
      // serves as the break-glass trail.  Operators should review these
      // events periodically and constrain access to the narrowest set of
      // administrators needed for legitimate investigations.
      const messages = await db.query.chatMessages.findMany({
        where: eq(chatMessages.sessionId, sessionId),
        orderBy: [asc(chatMessages.createdAt)],
        with: {
          user: { columns: { id: true, name: true, username: true } },
        },
      });
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "chat_log.session_viewed",
        resourceType: "chat_session",
        resourceId: sessionId,
        resourceLabel: sessionId,
        summary: `Privileged transcript access: viewed chat session ${sessionId} (${messages.length} messages)`,
        details: { sessionId, messageCount: messages.length, accessType: "break-glass-transcript" },
        request: req,
      });
      return NextResponse.json({ messages });
    }

    // Get session list (grouped by sessionId)
    const filters = [];
    if (userId) {
      filters.push(eq(chatMessages.userId, userId));
    }

    const sessions = await rawQueryAll<{
      sessionId: string;
      userId: string | null;
      problemId: string | null;
      provider: string | null;
      model: string | null;
      messageCount: number;
      firstMessage: string | null;
      startedAt: string;
      lastMessageAt: string;
      userName: string | null;
      username: string | null;
      total: number;
    }>(
      `WITH filtered AS (
         SELECT *
         FROM chat_messages
         WHERE (@userId::text IS NULL OR user_id = @userId::text)
       ),
       session_bounds AS (
         SELECT
           session_id,
           COUNT(*)::int AS "messageCount",
           MIN(created_at) AS "startedAt",
           MAX(created_at) AS "lastMessageAt"
         FROM filtered
         GROUP BY session_id
       ),
       session_first AS (
         SELECT DISTINCT ON (session_id)
           session_id AS "sessionId",
           user_id AS "userId",
           problem_id AS "problemId",
           provider,
           model,
           content AS "firstMessage"
         FROM filtered
         ORDER BY session_id, created_at ASC, id ASC
       )
       SELECT
         first_row."sessionId",
         first_row."userId",
         first_row."problemId",
         first_row.provider,
         first_row.model,
         bounds."messageCount",
         first_row."firstMessage",
         bounds."startedAt",
         bounds."lastMessageAt",
         u.name AS "userName",
         u.username,
         COUNT(*) OVER() AS total
       FROM session_bounds bounds
       INNER JOIN session_first first_row ON first_row."sessionId" = bounds.session_id
       LEFT JOIN users u ON u.id = first_row."userId"
       ORDER BY bounds."lastMessageAt" DESC
       LIMIT @limit OFFSET @offset`,
      { userId, limit, offset }
    );

    // Extract total from the first row (COUNT(*) OVER() is the same for all rows)
    const total = sessions.length > 0 ? Number(sessions[0].total) : 0;

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "chat_log.list_viewed",
      resourceType: "chat_log",
      resourceId: userId ?? null,
      resourceLabel: userId ?? "all",
      summary: userId
        ? `Viewed chat-log sessions filtered to user ${userId}`
        : "Viewed chat-log session index",
      details: { userId, page, limit },
      request: req,
    });

    return NextResponse.json({ sessions, total, page, limit });
  },
});
