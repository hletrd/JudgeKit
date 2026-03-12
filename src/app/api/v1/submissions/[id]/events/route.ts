import { NextRequest } from "next/server";
import { apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden, notFound, isAdmin } from "@/lib/api/auth";
import { IN_PROGRESS_JUDGE_STATUSES } from "@/lib/judge/verdict";
import { logger } from "@/lib/logger";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000;
const AUTH_RECHECK_INTERVAL_MS = 30_000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;

    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
      columns: {
        id: true,
        userId: true,
        status: true,
      },
    });

    if (!submission) return notFound("Submission");

    if (submission.userId !== user.id && !isAdmin(user.role)) {
      return forbidden();
    }

    // If already in a terminal state, return the full submission immediately as a single event
    if (!IN_PROGRESS_JUDGE_STATUSES.has(submission.status ?? "")) {
      const fullSubmission = await queryFullSubmission(id);
      const body = `event: result\ndata: ${JSON.stringify(fullSubmission)}\n\n`;
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
        }, TIMEOUT_MS);

        let lastAuthCheck = Date.now();

        const pollTimer = setInterval(() => {
          void (async () => {
            if (closed) return;

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
        }, POLL_INTERVAL_MS);
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
