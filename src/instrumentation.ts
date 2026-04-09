import { getValidatedAuthSecret, getValidatedJudgeAuthToken } from "@/lib/security/env";
import { startRateLimitEviction } from "@/lib/security/rate-limit";
import { startAuditEventPruning } from "@/lib/audit/events";
import { registerAuditFlushOnShutdown } from "@/lib/audit/node-shutdown";
import { syncLanguageConfigsOnStartup } from "@/lib/judge/sync-language-configs";
import { initializeSettings } from "@/lib/system-settings-config";

export async function register() {
  getValidatedAuthSecret();
  getValidatedJudgeAuthToken();

  // Insert any missing language configs into the database
  await syncLanguageConfigsOnStartup();

  // Load admin-configured settings from DB before serving any requests
  await initializeSettings();

  // Start background maintenance jobs (only runs once per process)
  startRateLimitEviction();
  startAuditEventPruning();
  registerAuditFlushOnShutdown();
}
