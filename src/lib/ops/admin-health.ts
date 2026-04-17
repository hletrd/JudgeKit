import { getAuditEventHealthSnapshot } from "@/lib/audit/events";
import { rawQueryOne } from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import { getConfiguredSettings } from "@/lib/system-settings-config";

const PROCESS_STARTED_AT_MS = Date.now();

type WorkerStatsRow = {
  online?: string | number | null;
  stale?: string | number | null;
  offline?: string | number | null;
};

type QueueStatsRow = {
  pending?: string | number | null;
};

export type AdminHealthSnapshot = {
  checks: {
    auditEvents: "ok" | "degraded";
    database: "ok" | "error";
  };
  judgeWorkers: {
    online: number;
    stale: number;
    offline: number;
  };
  submissionQueue: {
    pending: number;
    limit: number;
  };
  uptimeSeconds: number;
  responseTimeMs: number;
  appVersion: string;
  status: "ok" | "degraded" | "error";
  timestamp: string;
  details?: {
    auditEvents: {
      failedWrites: number;
      lastFailureAt: string | null;
    };
  };
  error?: "healthCheckFailed";
};

function toCount(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function buildSnapshotBase() {
  const settings = getConfiguredSettings();
  const auditEvents = getAuditEventHealthSnapshot();
  const timestamp = new Date().toISOString();

  return {
    auditEvents,
    settings,
    timestamp,
  };
}

export async function getAdminHealthSnapshot(): Promise<AdminHealthSnapshot> {
  const { auditEvents, settings, timestamp } = buildSnapshotBase();
  const probeStartedAt = Date.now();

  try {
    await rawQueryOne("select 1");

    const workerStats = await rawQueryOne<WorkerStatsRow>(
      `SELECT
        count(*) FILTER (WHERE status = 'online') AS online,
        count(*) FILTER (WHERE status = 'stale') AS stale,
        count(*) FILTER (WHERE status = 'offline') AS offline
      FROM judge_workers`
    );

    const queueStats = await rawQueryOne<QueueStatsRow>(
      `SELECT count(*) FILTER (WHERE status IN ('pending', 'queued', 'judging')) AS pending
      FROM submissions`
    );

    const online = toCount(workerStats?.online);
    const stale = toCount(workerStats?.stale);
    const offline = toCount(workerStats?.offline);
    const pending = toCount(queueStats?.pending);
    const overallStatus =
      auditEvents.status === "degraded" || stale > 0 || (pending > 0 && online === 0)
        ? "degraded"
        : "ok";

    return {
      checks: {
        auditEvents: auditEvents.status,
        database: "ok",
      },
      judgeWorkers: {
        online,
        stale,
        offline,
      },
      submissionQueue: {
        pending,
        limit: settings.submissionGlobalQueueLimit,
      },
      uptimeSeconds: Math.floor((Date.now() - PROCESS_STARTED_AT_MS) / 1000),
      responseTimeMs: Date.now() - probeStartedAt,
      appVersion: process.env.npm_package_version ?? "unknown",
      status: overallStatus,
      timestamp,
      ...(auditEvents.failedWrites > 0
        ? {
            details: {
              auditEvents: {
                failedWrites: auditEvents.failedWrites,
                lastFailureAt: auditEvents.lastFailureAt,
              },
            },
          }
        : {}),
    };
  } catch (error) {
    logger.error({ err: error }, "Admin health snapshot failed");

    return {
      checks: {
        auditEvents: auditEvents.status,
        database: "error",
      },
      judgeWorkers: {
        online: 0,
        stale: 0,
        offline: 0,
      },
      submissionQueue: {
        pending: 0,
        limit: settings.submissionGlobalQueueLimit,
      },
      uptimeSeconds: Math.floor((Date.now() - PROCESS_STARTED_AT_MS) / 1000),
      responseTimeMs: Date.now() - probeStartedAt,
      appVersion: process.env.npm_package_version ?? "unknown",
      status: "error",
      timestamp,
      error: "healthCheckFailed",
    };
  }
}
