// SSE route: not migrated to createApiHandler due to streaming response
import { NextRequest } from "next/server";
import { apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden, notFound } from "@/lib/api/auth";
import { canAccessSubmission } from "@/lib/auth/permissions";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { IN_PROGRESS_JUDGE_STATUSES } from "@/lib/judge/verdict";
import { logger } from "@/lib/logger";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { getConfiguredSettings } from "@/lib/system-settings-config";

// ---------------------------------------------------------------------------
// Connection tracking via Set<connectionId> to avoid TOCTOU races.
// Each connection ID encodes the userId so per-user counts can be derived.
// ---------------------------------------------------------------------------
interface ConnectionInfo {
  userId: string;
  createdAt: number;
}
const activeConnectionSet = new Set<string>();
const connectionInfoMap = new Map<string, ConnectionInfo>();

const MAX_GLOBAL_SSE_CONNECTIONS = 500;
const AUTH_RECHECK_INTERVAL_MS = 30_000;

function generateConnectionId(userId: string): string {
  return `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function countUserConnections(userId: string): number {
  let count = 0;
  for (const connId of activeConnectionSet) {
    const info = connectionInfoMap.get(connId);
    if (info && info.userId === userId) count++;
  }
  return count;
}

function addConnection(connId: string, userId: string): void {
  activeConnectionSet.add(connId);
  connectionInfoMap.set(connId, { userId, createdAt: Date.now() });
}

function removeConnection(connId: string): void {
  activeConnectionSet.delete(connId);
  connectionInfoMap.delete(connId);
}

// Periodic cleanup of stale connection tracking entries
const CLEANUP_INTERVAL_MS = 60_000;
declare global {
  var __sseCleanupTimer: ReturnType<typeof setInterval> | undefined;
}

if (globalThis.__sseCleanupTimer) clearInterval(globalThis.__sseCleanupTimer);
globalThis.__sseCleanupTimer = setInterval(() => {
  const now = Date.now();
  const staleThreshold = Math.min(getConfiguredSettings().sseTimeoutMs + 30_000, 2 * 60 * 60 * 1000);
  for (const [connId, info] of connectionInfoMap) {
    if (now - info.createdAt > staleThreshold) {
      removeConnection(connId);
    }
  }
}, CLEANUP_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Shared polling manager: one setInterval queries ALL active submission IDs
// in a single batch, then dispatches results to per-connection callbacks.
// ---------------------------------------------------------------------------
type PollCallback = (status: string) => void;

const submissionSubscribers = new Map<string, Set<PollCallback>>();
let sharedPollTimer: ReturnType<typeof setInterval> | null = null;

function subscribeToPoll(submissionId: string, callback: PollCallback): void {
  let subs = submissionSubscribers.get(submissionId);
  if (!subs) {
    subs = new Set();
    submissionSubscribers.set(submissionId, subs);
  }
  subs.add(callback);

  // Start the shared poll timer if not already running
  if (!sharedPollTimer) {
    startSharedPollTimer();
  }
}

function unsubscribeFromPoll(submissionId: string, callback: PollCallback): void {
  const subs = submissionSubscribers.get(submissionId);
  if (!subs) return;
  subs.delete(callback);
  if (subs.size === 0) {
    submissionSubscribers.delete(submissionId);
  }

  // Stop the timer if no more subscribers
  if (submissionSubscribers.size === 0 && sharedPollTimer) {
    clearInterval(sharedPollTimer);
    sharedPollTimer = null;
  }
}

function startSharedPollTimer(): void {
  const configuredInterval = getConfiguredSettings().ssePollIntervalMs;
  const pollIntervalMs = Math.max(1000, configuredInterval);
  sharedPollTimer = setInterval(() => {
    void sharedPollTick();
  }, pollIntervalMs);
}

async function sharedPollTick(): Promise<void> {
  const submissionIds = Array.from(submissionSubscribers.keys());
  if (submissionIds.length === 0) return;

  try {
    // Single batch query for all active submission IDs
    const results = await db
      .select({ id: submissions.id, status: submissions.status })
      .from(submissions)
      .where(inArray(submissions.id, submissionIds));

    const statusMap = new Map<string, string>();
    for (const row of results) {
      statusMap.set(row.id, row.status ?? "");
    }

    // Dispatch results to all subscribers
    for (const [subId, subs] of submissionSubscribers) {
      const status = statusMap.get(subId) ?? "";
      for (const cb of subs) {
        try {
          cb(status);
        } catch {
          // Individual callback errors should not break the loop
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Shared SSE poll tick error");
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const rateLimitResponse = await consumeApiRateLimit(request, "submissions:events");
    if (rateLimitResponse) return rateLimitResponse;

    if (activeConnectionSet.size >= MAX_GLOBAL_SSE_CONNECTIONS) {
      return apiError("serverBusy", 503);
    }

    // Enforce per-user SSE connection cap
    const sseConfig = getConfiguredSettings();
    const userId = user.id;
    if (countUserConnections(userId) >= sseConfig.maxSseConnectionsPerUser) {
      return apiError("tooManyConnections", 429);
    }

    // Register connection IMMEDIATELY after cap checks, BEFORE any awaits,
    // to close the TOCTOU window where concurrent requests could bypass caps.
    const connId = generateConnectionId(userId);
    addConnection(connId, userId);

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

    if (!submission) {
      removeConnection(connId);
      return notFound("Submission");
    }

    const hasAccess = await canAccessSubmission(submission, user.id, user.role);
    if (!hasAccess) {
      removeConnection(connId);
      return forbidden();
    }

    const isOwner = submission.userId === user.id;
    const caps = await resolveCapabilities(user.role);
    const canViewSource = caps.has("submissions.view_source");

    // If already in a terminal state, return the full submission immediately as a single event
    if (!IN_PROGRESS_JUDGE_STATUSES.has(submission.status ?? "")) {
      const fullSubmission = await queryFullSubmission(id);
      const sanitized = (!isOwner && !canViewSource && fullSubmission)
        ? stripSourceCode(fullSubmission)
        : fullSubmission;
      const body = `event: result\ndata: ${JSON.stringify(sanitized)}\n\n`;
      removeConnection(connId);
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
          unsubscribeFromPoll(id, onPollResult);
          clearTimeout(timeoutTimer);
          removeConnection(connId);
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

        // Callback invoked by the shared poll timer with the latest status
        const onPollResult: PollCallback = (status: string) => {
          if (closed) return;

          // Periodically re-check auth to ensure deactivated users don't keep receiving data
          const now = Date.now();
          if (now - lastAuthCheck >= AUTH_RECHECK_INTERVAL_MS) {
            lastAuthCheck = now;
            void (async () => {
              const reAuthUser = await getApiUser(request);
              if (!reAuthUser) {
                close();
              }
            })();
            // Don't return early -- still process the current status update
            // (the auth revocation will take effect on the next tick)
          }

          if (!status) {
            // Submission was deleted
            close();
            return;
          }

          if (!IN_PROGRESS_JUDGE_STATUSES.has(status)) {
            // Terminal state reached -- fetch full submission and send final event
            void (async () => {
              try {
                const fullSubmission = await queryFullSubmission(id);
                if (closed) return;
                const sanitized = (!isOwner && !canViewSource && fullSubmission)
                  ? stripSourceCode(fullSubmission)
                  : fullSubmission;
                controller.enqueue(
                  encoder.encode(`event: result\ndata: ${JSON.stringify(sanitized)}\n\n`)
                );
              } catch (err) {
                if (!closed) {
                  logger.error({ err }, "SSE final fetch error for submission %s", id);
                  controller.enqueue(encoder.encode(`event: error\ndata: {"error":"fetch_failed"}\n\n`));
                }
              } finally {
                close();
              }
            })();
            return;
          }

          // Emit a status heartbeat so the client knows the connection is alive
          try {
            controller.enqueue(
              encoder.encode(`event: status\ndata: ${JSON.stringify({ status })}\n\n`)
            );
          } catch (err) {
            if (!closed) {
              logger.error({ err }, "SSE enqueue error for submission %s", id);
              close();
            }
          }
        };

        subscribeToPoll(id, onPollResult);
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

function stripSourceCode<T extends Record<string, unknown>>(obj: T): Omit<T, "sourceCode"> {
  const { sourceCode: _sourceCode, ...rest } = obj;
  void _sourceCode;
  return rest as Omit<T, "sourceCode">;
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
