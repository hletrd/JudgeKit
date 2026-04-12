import { logger } from "@/lib/logger";

const SHARED_REALTIME_BACKENDS = new Set(["redis", "postgresql"]);
let hasWarnedSingleInstanceOnly = false;

function parseReplicaCount(value: string | undefined) {
  if (!value) return 1;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function getRealtimeCoordinationStatus() {
  const backend = (process.env.REALTIME_COORDINATION_BACKEND || "none").trim().toLowerCase();
  const replicaCount = parseReplicaCount(
    process.env.APP_INSTANCE_COUNT || process.env.WEB_CONCURRENCY,
  );
  const hasSharedCoordination = SHARED_REALTIME_BACKENDS.has(backend);

  return {
    backend,
    replicaCount,
    hasSharedCoordination,
    requiresSingleInstanceGuard: replicaCount > 1 && !hasSharedCoordination,
  };
}

export function warnIfSingleInstanceRealtimeOnly(routeName: string) {
  const status = getRealtimeCoordinationStatus();
  if (status.hasSharedCoordination || hasWarnedSingleInstanceOnly) {
    return;
  }

  hasWarnedSingleInstanceOnly = true;
  logger.warn(
    { routeName, backend: status.backend, replicaCount: status.replicaCount },
    "[realtime] Running with process-local coordination; keep the web app single-instance unless shared realtime coordination is configured",
  );
}

export function getUnsupportedRealtimeGuard(routeName: string) {
  const status = getRealtimeCoordinationStatus();
  if (!status.requiresSingleInstanceGuard) {
    warnIfSingleInstanceRealtimeOnly(routeName);
    return null;
  }

  logger.error(
    { routeName, backend: status.backend, replicaCount: status.replicaCount },
    "[realtime] Multi-instance deployment configured without shared realtime coordination",
  );
  return {
    error: "unsupportedMultiInstanceRealtime",
    message: "Configure shared realtime coordination or keep the web app to a single instance for this route.",
  };
}
