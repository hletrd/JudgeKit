import { headers } from "next/headers";
import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { normalizeText, getClientIp, getRequestPath, MAX_TEXT_LENGTH, MAX_PATH_LENGTH } from "@/lib/security/request-context";
import { logger } from "@/lib/logger";
import { DATA_RETENTION_DAYS, DATA_RETENTION_LEGAL_HOLD, getRetentionCutoff } from "@/lib/data-retention";

type RequestLike = {
  headers: Headers;
  method?: string | null;
  url?: string | null;
};

type AuditRequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestMethod?: string | null;
  requestPath?: string | null;
};

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type RecordAuditEventInput = {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  resourceLabel?: string | null;
  summary: string;
  details?: JsonValue | null;
  request?: RequestLike;
  context?: AuditRequestContext;
};

const MAX_JSON_LENGTH = 4000;
const MAX_SILENT_FAILURES = 3;
let auditEventWriteFailures = 0;
let consecutiveAuditFailures = 0;
let lastAuditEventWriteFailureAt: string | null = null;

function serializeDetails(details: JsonValue | null | undefined) {
  if (details == null) {
    return null;
  }

  try {
    return JSON.stringify(details).slice(0, MAX_JSON_LENGTH);
  } catch {
    return null;
  }
}

export function buildAuditRequestContext(request: RequestLike): AuditRequestContext {
  return {
    ipAddress: getClientIp(request.headers),
    userAgent: normalizeText(request.headers.get("user-agent"), MAX_TEXT_LENGTH),
    requestMethod: normalizeText(request.method, 32)?.toUpperCase() ?? null,
    requestPath: getRequestPath(request.url),
  };
}

export async function buildServerActionAuditContext(
  requestPath: string,
  requestMethod = "SERVER_ACTION"
): Promise<AuditRequestContext> {
  const headerStore = await headers();

  return {
    ipAddress: getClientIp(headerStore),
    userAgent: normalizeText(headerStore.get("user-agent"), MAX_TEXT_LENGTH),
    requestMethod: normalizeText(requestMethod, 32)?.toUpperCase() ?? null,
    requestPath: normalizeText(requestPath, MAX_PATH_LENGTH),
  };
}

// --- Write buffer for batched audit inserts ---
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_SIZE_THRESHOLD = 50;

type AuditEventRow = typeof auditEvents.$inferInsert;
let _auditBuffer: AuditEventRow[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;

function ensureFlushTimer() {
  if (_flushTimer) return;
  _flushTimer = setInterval(flushAuditBuffer, FLUSH_INTERVAL_MS);
  // Allow the process to exit even if the timer is still active
  if (_flushTimer && typeof _flushTimer === "object" && "unref" in _flushTimer) {
    _flushTimer.unref();
  }
}

/**
 * Flush all buffered audit events to the database in a single batch insert.
 * Exported for use during graceful shutdown.
 */
export async function flushAuditBuffer(): Promise<void> {
  if (_auditBuffer.length === 0) return;

  const batch = _auditBuffer;
  _auditBuffer = [];

  try {
    await db.insert(auditEvents).values(batch);
    consecutiveAuditFailures = 0;
  } catch (error) {
    auditEventWriteFailures += batch.length;
    consecutiveAuditFailures += 1;
    lastAuditEventWriteFailureAt = new Date().toISOString();
    // Re-buffer lost events (cap at 2x threshold to prevent unbounded growth)
    if (_auditBuffer.length < FLUSH_SIZE_THRESHOLD * 2) {
      _auditBuffer = [...batch, ..._auditBuffer];
    }
    if (consecutiveAuditFailures >= MAX_SILENT_FAILURES) {
      logger.error({ count: batch.length, err: error, consecutiveFailures: consecutiveAuditFailures }, `CRITICAL: failed to flush ${batch.length} audit events`);
    } else {
      logger.warn({ count: batch.length, err: error }, "Failed to flush audit event batch");
    }
  }
}

export function recordAuditEvent({
  actorId,
  actorRole,
  action,
  resourceType,
  resourceId,
  resourceLabel,
  summary,
  details,
  request,
  context,
}: RecordAuditEventInput) {
  const resolvedContext = request ? buildAuditRequestContext(request) : context;

  _auditBuffer.push({
    actorId: normalizeText(actorId, 64),
    actorRole: normalizeText(actorRole, 32),
    action: normalizeText(action, 128) ?? "unknown",
    resourceType: normalizeText(resourceType, 64) ?? "unknown",
    resourceId: normalizeText(resourceId, 64),
    resourceLabel: normalizeText(resourceLabel, MAX_TEXT_LENGTH),
    summary: normalizeText(summary, MAX_TEXT_LENGTH) ?? "Audit event",
    details: serializeDetails(details),
    ipAddress: normalizeText(resolvedContext?.ipAddress, 128),
    userAgent: normalizeText(resolvedContext?.userAgent, MAX_TEXT_LENGTH),
    requestMethod: normalizeText(resolvedContext?.requestMethod, 32),
    requestPath: normalizeText(resolvedContext?.requestPath, MAX_PATH_LENGTH),
  });

  ensureFlushTimer();

  if (_auditBuffer.length >= FLUSH_SIZE_THRESHOLD) {
    flushAuditBuffer().catch(() => {
      // Error already logged inside flushAuditBuffer
    });
  }
}

export function getAuditEventHealthSnapshot() {
  return {
    failedWrites: auditEventWriteFailures,
    lastFailureAt: lastAuditEventWriteFailureAt,
    status: auditEventWriteFailures === 0 ? "ok" : "degraded",
  } as const;
}

const PRUNE_BATCH_SIZE = 5000;
const PRUNE_BATCH_DELAY_MS = 100;

async function pruneOldAuditEvents() {
  if (DATA_RETENTION_LEGAL_HOLD) {
    logger.info("Data retention legal hold is active — skipping audit event pruning");
    return;
  }
  const cutoff = getRetentionCutoff(DATA_RETENTION_DAYS.auditEvents);
  try {
    let totalDeleted = 0;
    while (true) {
      const result = await db.execute(
        sql`DELETE FROM ${auditEvents} WHERE ${auditEvents.createdAt} < ${cutoff} LIMIT ${PRUNE_BATCH_SIZE}`
      );
      const deleted = Number(result.rowCount ?? 0);
      totalDeleted += deleted;
      if (deleted < PRUNE_BATCH_SIZE) break;
      await new Promise((r) => setTimeout(r, PRUNE_BATCH_DELAY_MS));
    }
    logger.debug({ cutoff: cutoff.toISOString(), deleted: totalDeleted }, "Pruned old audit events");
  } catch (error) {
    logger.warn({ err: error }, "Failed to prune old audit events");
  }
}

// Run retention cleanup once per day
let pruneTimer: ReturnType<typeof setInterval> | null = null;
declare global {
  var __auditPruneTimer: ReturnType<typeof setInterval> | undefined;
}

export function startAuditEventPruning() {
  if (globalThis.__auditPruneTimer) clearInterval(globalThis.__auditPruneTimer);
  globalThis.__auditPruneTimer = setInterval(pruneOldAuditEvents, 24 * 60 * 60 * 1000);
  pruneTimer = globalThis.__auditPruneTimer;

  // Run an initial prune on startup so retention is enforced even if the app restarts frequently
  pruneOldAuditEvents().catch(() => {
    // Errors already logged inside pruneOldAuditEvents
  });
}

export function stopAuditEventPruning() {
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
}

// --- Graceful shutdown: flush audit buffer before process exits ---

function handleGracefulShutdown() {
  // Flush synchronously-ish: fire the flush and give it a brief window.
  // This is best-effort — SIGKILL cannot be caught.
  void flushAuditBuffer().then(() => {
    process.exit(0);
  }).catch(() => {
    process.exit(1);
  });
}

process.on("SIGTERM", () => handleGracefulShutdown());
process.on("SIGINT", () => handleGracefulShutdown());
process.on("beforeExit", () => {
  // beforeExit fires when the event loop is empty but before the process exits.
  // No exit is forced, so we just flush without calling process.exit().
  void flushAuditBuffer();
});
