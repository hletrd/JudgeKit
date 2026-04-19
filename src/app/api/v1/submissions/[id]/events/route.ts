// SSE route: not migrated to createApiHandler due to streaming response
import { randomUUID } from "crypto";
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
import { sanitizeSubmissionForViewer } from "@/lib/submissions/visibility";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { getConfiguredSettings } from "@/lib/system-settings-config";
import { acquireSharedSseConnectionSlot, getRealtimeConnectionKey, getUnsupportedRealtimeGuard, releaseSharedSseConnectionSlot, usesSharedRealtimeCoordination } from "@/lib/realtime/realtime-coordination";

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
/** Per-user connection count index for O(1) lookup instead of O(n) iteration. */
const userConnectionCounts = new Map<string, number>();

const MAX_GLOBAL_SSE_CONNECTIONS = 500;
const MAX_TRACKED_CONNECTIONS = MAX_GLOBAL_SSE_CONNECTIONS * 2;
const AUTH_RECHECK_INTERVAL_MS = 30_000;

function generateConnectionId(userId: string): string {
  return `${userId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function addConnection(connId: string, userId: string): void {
  // Evict oldest-by-age entries if tracking map exceeds cap.
  // Must evict by createdAt, not by insertion order, to avoid removing
  // tracking entries for active long-lived connections while keeping
  // entries for newer connections that may already be closed.
  while (connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, info] of connectionInfoMap) {
      if (info.createdAt < oldestTime) {
        oldestTime = info.createdAt;
        oldestKey = key;
      }
    }
    if (oldestKey) removeConnection(oldestKey);
    else break;
  }
  activeConnectionSet.add(connId);
  connectionInfoMap.set(connId, { userId, createdAt: Date.now() });
  userConnectionCounts.set(userId, (userConnectionCounts.get(userId) ?? 0) + 1);
}

function removeConnection(connId: string): void {
  const info = connectionInfoMap.get(connId);
  activeConnectionSet.delete(connId);
  connectionInfoMap.delete(connId);
  if (info) {
    const count = (userConnectionCounts.get(info.userId) ?? 1) - 1;
    if (count <= 0) {
      userConnectionCounts.delete(info.userId);
    } else {
      userConnectionCounts.set(info.userId, count);
    }
  }
}

// Periodic cleanup of stale connection tracking entries
const CLEANUP_INTERVAL_MS = 60_000;
declare global {
  var __sseCleanupTimer: ReturnType<typeof setInterval> | undefined;
}

if (globalThis.__sseCleanupTimer) clearInterval(globalThis.__sseCleanupTimer);
globalThis.__sseCleanupTimer = setInterval(() => {
  if (connectionInfoMap.size === 0) return;
  const now = Date.now();
  const staleThreshold = Math.min(getConfiguredSettings().sseTimeoutMs + 30_000, 2 * 60 * 60 * 1000);
  for (const [connId, info] of connectionInfoMap) {
    if (now - info.createdAt > staleThreshold) {
      removeConnection(connId)
    }
  }
}, CLEANUP_INTERVAL_MS);
// Allow the process to exit even if the timer is still active
if (globalThis.__sseCleanupTimer && typeof globalThis.__sseCleanupTimer === "object" && "unref" in globalThis.__sseCleanupTimer) {
  globalThis.__sseCleanupTimer.unref();
}

// Graceful shutdown: in-memory connection tracking is cleaned up on process
// exit automatically. The audit-buffer flush is handled by
// registerAuditFlushOnShutdown() in node-shutdown.ts (called from
// instrumentation.ts).

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
  // Allow the process to exit even if the timer is still active
  if (sharedPollTimer && typeof sharedPollTimer === "object" && "unref" in sharedPollTimer) {
    sharedPollTimer.unref();
  }
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
        } catch (err) {
          // Individual callback errors should not break the loop
          logger.debug({ err, subId }, "[sse] subscriber callback error during poll tick");
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

    const realtimeGuard = getUnsupportedRealtimeGuard("/api/v1/submissions/[id]/events");
    if (realtimeGuard) {
      return apiError(realtimeGuard.error, 503);
    }

    const rateLimitResponse = await consumeApiRateLimit(request, "submissions:events");
    if (rateLimitResponse) return rateLimitResponse;

    // Enforce global/per-user SSE connection caps.
    const sseConfig = getConfiguredSettings();
    const userId = user.id;
    const connId = generateConnectionId(userId);
    const useSharedCoordination = usesSharedRealtimeCoordination();
    const sharedConnectionKey = getRealtimeConnectionKey(userId, connId);

    if (useSharedCoordination) {
      const sharedResult = await acquireSharedSseConnectionSlot({
        userId,
        connectionId: connId,
        maxGlobalConnections: MAX_GLOBAL_SSE_CONNECTIONS,
        maxUserConnections: sseConfig.maxSseConnectionsPerUser,
        timeoutMs: sseConfig.sseTimeoutMs,
      });
      if (!sharedResult.ok) {
        return apiError(sharedResult.reason, sharedResult.reason === "serverBusy" ? 503 : 429);
      }
    } else {
      if (activeConnectionSet.size >= MAX_GLOBAL_SSE_CONNECTIONS) {
        return apiError("serverBusy", 503);
      }
      if ((userConnectionCounts.get(userId) ?? 0) >= sseConfig.maxSseConnectionsPerUser) {
        return apiError("tooManyConnections", 429);
      }
      addConnection(connId, userId);
    }

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
      if (useSharedCoordination) { await releaseSharedSseConnectionSlot(sharedConnectionKey); } else { removeConnection(connId); }
      return notFound("Submission");
    }

    const hasAccess = await canAccessSubmission(submission, user.id, user.role);
    if (!hasAccess) {
      if (useSharedCoordination) {
        await releaseSharedSseConnectionSlot(sharedConnectionKey);
      } else {
        removeConnection(connId);
      }
      return forbidden();
    }

    const caps = await resolveCapabilities(user.role);

    // If already in a terminal state, return the full submission immediately as a single event
    if (!IN_PROGRESS_JUDGE_STATUSES.has(submission.status ?? "")) {
      const fullSubmission = await queryFullSubmission(id);
      const sanitized = fullSubmission
        ? await sanitizeSubmissionForViewer(fullSubmission, user.id, caps)
        : null;
      const body = `event: result\ndata: ${JSON.stringify(sanitized)}\n\n`;
      if (useSharedCoordination) {
        await releaseSharedSseConnectionSlot(sharedConnectionKey);
      } else {
        removeConnection(connId);
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
          unsubscribeFromPoll(id, onPollResult);
          clearTimeout(timeoutTimer);
          if (useSharedCoordination) {
            void releaseSharedSseConnectionSlot(sharedConnectionKey);
          } else {
            removeConnection(connId);
          }
          try {
            controller.close();
          } catch (err) {
            // stream already closed
            logger.debug({ err }, "[sse] controller.close() failed, stream likely already closed");
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

        // Shared helper: fetch full submission, sanitize, and send the terminal
        // result event. Used from both the re-auth path and the fast path to
        // avoid duplicating the terminal-state logic.
        async function sendTerminalResult() {
          // user is guaranteed non-null here — the SSE stream is only opened
          // after the auth check at the top of GET(), but TypeScript cannot
          // infer this across the closure boundary.
          const viewerId = user!.id;
          try {
            const fullSubmission = await queryFullSubmission(id);
            if (closed) return;
            const sanitized = fullSubmission
              ? await sanitizeSubmissionForViewer(fullSubmission, viewerId, caps)
              : null;
            if (closed) return;
            controller.enqueue(
              encoder.encode(`event: result\ndata: ${JSON.stringify(sanitized)}\n\n`)
            );
          } catch (err) {
            if (!closed) {
              logger.error({ err }, "SSE final fetch error for submission %s", id);
              // Send an error event so the client knows the fetch failed
              try {
                controller.enqueue(encoder.encode(`event: error\ndata: {"error":"fetch_failed"}\n\n`));
              } catch {
                // enqueue failed — stream likely already closed
              }
            }
          } finally {
            close();
          }
        }

        // Emit a status heartbeat so the client knows the connection is alive.
        // Returns true if enqueued successfully, false on error (triggers close).
        function emitStatusHeartbeat(status: string): boolean {
          try {
            controller.enqueue(
              encoder.encode(`event: status\ndata: ${JSON.stringify({ status })}\n\n`)
            );
            return true;
          } catch (err) {
            if (!closed) {
              logger.error({ err }, "SSE enqueue error for submission %s", id);
              close();
            }
            return false;
          }
        }

        // Callback invoked by the shared poll timer with the latest status.
        // The callback is async to allow awaiting the re-auth check before
        // processing the status event, preventing data leakage after account
        // deactivation and avoiding a race with the terminal result delivery.
        const onPollResult: PollCallback = (status: string) => {
          if (closed) return;

          // Periodically re-check auth to ensure deactivated users don't keep receiving data.
          // Await the check before processing the status event so that a revoked
          // user does not receive one more event after deactivation.
          const now = Date.now();
          if (now - lastAuthCheck >= AUTH_RECHECK_INTERVAL_MS) {
            lastAuthCheck = now;
            void (async () => {
              // Early exit if the connection closed between the IIFE invocation
              // and this async start — prevents a wasted DB query.
              if (closed) return;
              try {
                const reAuthUser = await getApiUser(request);
                if (!reAuthUser) {
                  close();
                  return;
                }
              } catch {
                // If re-auth check fails (e.g., malformed token), close the connection
                close();
                return;
              }

              // Re-auth passed — process the status event now
              if (closed) return;

              if (!status) {
                // Submission was deleted
                close();
                return;
              }

              if (!IN_PROGRESS_JUDGE_STATUSES.has(status)) {
                await sendTerminalResult();
                return;
              }

              emitStatusHeartbeat(status);
            })();
            return; // Don't process the event synchronously — the async IIFE handles it
          }

          if (!status) {
            // Submission was deleted
            close();
            return;
          }

          if (!IN_PROGRESS_JUDGE_STATUSES.has(status)) {
            void sendTerminalResult();
            return;
          }

          emitStatusHeartbeat(status);
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


async function queryFullSubmission(id: string) {
  return db.query.submissions.findFirst({
    where: eq(submissions.id, id),
    with: {
      user: {
        columns: { name: true },
      },
      problem: {
        columns: {
          id: true,
          title: true,
          showCompileOutput: true,
          showDetailedResults: true,
          showRuntimeErrors: true,
        },
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
