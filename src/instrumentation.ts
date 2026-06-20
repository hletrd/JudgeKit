export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const [
    { getValidatedAuthSecret, getValidatedJudgeAuthToken },
    { assertProductionConfig },
    { startRateLimitEviction },
    { startWorkerStalenessSweep },
    { startAuditEventPruning },
    { startSensitiveDataPruning },
    { registerAuditFlushOnShutdown },
    { syncLanguageConfigsOnStartup },
    { initializeSettings },
  ] = await Promise.all([
    import("@/lib/security/env"),
    import("@/lib/security/production-config"),
    import("@/lib/security/rate-limit"),
    import("@/lib/judge/worker-staleness-sweep"),
    import("@/lib/audit/events"),
    import("@/lib/data-retention-maintenance"),
    import("@/lib/audit/node-shutdown"),
    import("@/lib/judge/sync-language-configs"),
    import("@/lib/system-settings-config"),
  ]);

  assertProductionConfig();
  getValidatedAuthSecret();
  getValidatedJudgeAuthToken();

  // Insert any missing language configs into the database
  await syncLanguageConfigsOnStartup();

  // Load admin-configured settings from DB before serving any requests
  await initializeSettings();

  // Start background maintenance jobs (only runs once per process)
  startRateLimitEviction();
  startAuditEventPruning();
  startSensitiveDataPruning();
  // Reap stale/dead workers on a process interval so a crashed single worker is
  // detected even when no other heartbeat would trigger the inline sweep.
  startWorkerStalenessSweep();
  registerAuditFlushOnShutdown();
}
