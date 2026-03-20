import { NextRequest } from "next/server";
import { apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden, notFound } from "@/lib/api/auth";
import { canAccessSubmission } from "@/lib/auth/permissions";
import { IN_PROGRESS_JUDGE_STATUSES } from "@/lib/judge/verdict";
import { logger } from "@/lib/logger";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { getConfiguredSettings } from "@/lib/system-settings-config";

// Track active SSE connections per user to prevent resource exhaustion
const activeConnections = new Map<string, number>();
const connectionLastActivity = new Map<string, number>();

const AUTH_RECHECK_INTERVAL_MS = 30_000;

// Periodic cleanup of stale connection tracking entries
const CLEANUP_INTERVAL_MS = 60_000;
setInterval(() => {
  const now = Date.now();
  const staleThreshold = getConfiguredSettings().sseTimeoutMs + 30_000; // timeout + 30s buffer
  for (const [userId, lastActive] of connectionLastActivity) {
    if (now - lastActive > staleThreshold) {
      activeConnections.delete(userId);
      connectionLastActivity.delete(userId);
    }
  }
}, CLEANUP_INTERVAL_MS);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const rateLimitResponse = consumeApiRateLimit(request, "submissions:events");
    if (rateLimitResponse) return rateLimitResponse;

    // Enforce per-user SSE connection cap
    const sseConfig = getConfiguredSettings();
    const currentCount = activeConnections.get(user.id) ?? 0;
    if (currentCount >= sseConfig.maxSseConnectionsPerUser) {
      return apiError("tooManyConnections", 429);
    }
    activeConnections.set(user.id, currentCount + 1);
    connectionLastActivity.set(user.id, Date.now());

    const userId = user.id;

    const { id } = await params;

    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
      columns: {
        id: true,
        userId: true,
        status: true,
        assignmentId: true,
      },
    });

    if (!submission) return notFound("Submission");

    const hasAccess = await canAccessSubmission(submission, user.id, user.role);
    if (!hasAccess) return forbidden();

    // If already in a terminal state, return the full submission immediately as a single event
    if (!IN_PROGRESS_JUDGE_STATUSES.has(submission.status ?? "")) {
      const fullSubmission = await queryFullSubmission(id);
      const body = `event: result\ndata: ${JSON.stringify(fullSubmission)}\n\n`;
      // Decrement connection count for non-streaming early return
      const count = activeConnections.get(userId) ?? 1;
      if (count <= 1) {
        activeConnections.delete(userId);
      } else {
        activeConnections.set(userId, count - 1);
      }
      return new Response(body, {
        headers: sseHeaders(),
      });
    }

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let closed = false;

        function close() {
          if (closed) return;
          closed = true;
          clearInterval(pollTimer);
          clearTimeout(timeoutTimer);
          // Decrement active connection count
          const count = activeConnections.get(userId) ?? 1;
          if (count <= 1) {
            activeConnections.delete(userId);
            connectionLastActivity.delete(userId);
          } else {
            activeConnections.set(userId, count - 1);
          }
          try {
            controller.close();
          } catch {
            // stream already closed
          }
        }

        request.signal.addEventListener("abort", close, { once: true });

        const timeoutTimer = setTimeout(() => {
          if (!closed) {
            controller.enqueue(encoder.encode("event: timeout\ndata: {}\n\n"));
            close();
          }
        }, sseConfig.sseTimeoutMs);

        let lastAuthCheck = Date.now();

        const pollTimer = setInterval(() => {
          void (async () => {
            if (closed) return;
            connectionLastActivity.set(userId, Date.now());

              // Periodically re-check auth to ensure deactivated users don't continue receiving data
              if (Date.now() - lastAuthCheck >= AUTH_RECHECK_INTERVAL_MS) {
                lastAuthCheck = Date.now();
                const reAuthUser = await getApiUser(request);
                if (!reAuthUser) {
                  close();
                  return;
                }
              }

            try {
              const current = await db.query.submissions.findFirst({
                where: eq(submissions.id, id),
                columns: { status: true },
              });

              if (closed) return;

              if (!current) {
                close();
                return;
              }

              const status = current.status ?? "";

              if (!IN_PROGRESS_JUDGE_STATUSES.has(status)) {
                const fullSubmission = await queryFullSubmission(id);
                if (closed) return;
                controller.enqueue(
                  encoder.encode(`event: result\ndata: ${JSON.stringify(fullSubmission)}\n\n`)
                );
                close();
                return;
              }

              // Emit a status heartbeat so the client knows the connection is alive
              controller.enqueue(
                encoder.encode(`event: status\ndata: ${JSON.stringify({ status })}\n\n`)
              );
            } catch (err) {
              if (!closed) {
                logger.error({ err }, "SSE poll error for submission %s", id);
                close();
              }
            }
          })();
        }, sseConfig.ssePollIntervalMs);
      },
    });

    return new Response(stream, {
      headers: sseHeaders(),
    });
  } catch (error) {
    logger.error({ err: error }, "GET /api/v1/submissions/[id]/events error");
    return apiError("internalServerError", 500);
  }
}

function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

async function queryFullSubmission(id: string) {
  return db.query.submissions.findFirst({
    where: eq(submissions.id, id),
    with: {
      user: {
        columns: { name: true },
      },
      problem: {
        columns: { id: true, title: true },
      },
      results: {
        with: {
          testCase: {
            columns: { sortOrder: true },
          },
        },
      },
    },
  });
}
