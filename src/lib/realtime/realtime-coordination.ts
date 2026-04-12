import { logger } from "@/lib/logger";

let hasWarnedSingleInstanceOnly = false;
const TRUE_VALUES = /^(1|true|yes|on)$/i;

function parseReplicaCount(value: string | undefined) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getRealtimeCoordinationStatus() {
  const backend = (process.env.REALTIME_COORDINATION_BACKEND || "none").trim().toLowerCase();
  const replicaCount = parseReplicaCount(
    process.env.APP_INSTANCE_COUNT || process.env.WEB_CONCURRENCY,
  );
  const hasSharedCoordination = false;
  const isProductionLike = process.env.NODE_ENV === "production";
  const explicitSingleInstanceAck = TRUE_VALUES.test(
    process.env.REALTIME_SINGLE_INSTANCE_ACK || "",
  );
  const declaredSingleInstance = replicaCount === 1 || explicitSingleInstanceAck;
  const backendConfigUnsupported = backend !== "none";
  const deploymentDeclarationMissing =
    isProductionLike && !declaredSingleInstance && replicaCount === null && !backendConfigUnsupported;
  const multiInstanceRequested = replicaCount !== null && replicaCount > 1;

  return {
    backend,
    replicaCount,
    hasSharedCoordination,
    explicitSingleInstanceAck,
    backendConfigUnsupported,
    deploymentDeclarationMissing,
    requiresSingleInstanceGuard:
      !hasSharedCoordination && (backendConfigUnsupported || deploymentDeclarationMissing || multiInstanceRequested),
  };
}

export function warnIfSingleInstanceRealtimeOnly(routeName: string) {
  const status = getRealtimeCoordinationStatus();
  if (
    status.hasSharedCoordination
    || status.requiresSingleInstanceGuard
    || hasWarnedSingleInstanceOnly
  ) {
    return;
  }

  hasWarnedSingleInstanceOnly = true;
  logger.warn(
    {
      routeName,
      backend: status.backend,
      replicaCount: status.replicaCount,
      explicitSingleInstanceAck: status.explicitSingleInstanceAck,
    },
    "[realtime] Running with process-local coordination; keep the web app single-instance and declare APP_INSTANCE_COUNT=1 (or REALTIME_SINGLE_INSTANCE_ACK=1) unless shared realtime coordination is implemented",
  );
}

export function getUnsupportedRealtimeGuard(routeName: string) {
  const status = getRealtimeCoordinationStatus();
  if (!status.requiresSingleInstanceGuard) {
    warnIfSingleInstanceRealtimeOnly(routeName);
    return null;
  }

  if (status.backendConfigUnsupported) {
    logger.error(
      { routeName, backend: status.backend, replicaCount: status.replicaCount },
      "[realtime] Shared realtime backend configuration is declared but not implemented",
    );
    return {
      error: "unsupportedRealtimeBackendConfig",
      message:
        "REALTIME_COORDINATION_BACKEND is reserved until shared realtime coordination is implemented. Unset it and keep APP_INSTANCE_COUNT=1 (or REALTIME_SINGLE_INSTANCE_ACK=1).",
    };
  }

  if (status.deploymentDeclarationMissing) {
    logger.error(
      { routeName, backend: status.backend, replicaCount: status.replicaCount },
      "[realtime] Production deployment missing explicit single-instance declaration for process-local realtime coordination",
    );
    return {
      error: "realtimeDeploymentDeclarationRequired",
      message:
        "Declare APP_INSTANCE_COUNT=1 (or REALTIME_SINGLE_INSTANCE_ACK=1) before using process-local realtime routes in production.",
    };
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
