const DEFAULT_DATA_RETENTION_DAYS = {
  auditEvents: 90,
  chatMessages: 30,
  antiCheatEvents: 180,
  recruitingRecords: 365,
  submissions: 365,
  loginEvents: 180,
} as const;

function parseRetentionOverride(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const DATA_RETENTION_DAYS = {
  auditEvents: parseRetentionOverride("AUDIT_EVENT_RETENTION_DAYS", DEFAULT_DATA_RETENTION_DAYS.auditEvents),
  chatMessages: parseRetentionOverride("CHAT_MESSAGE_RETENTION_DAYS", DEFAULT_DATA_RETENTION_DAYS.chatMessages),
  antiCheatEvents: parseRetentionOverride("ANTI_CHEAT_RETENTION_DAYS", DEFAULT_DATA_RETENTION_DAYS.antiCheatEvents),
  recruitingRecords: parseRetentionOverride("RECRUITING_RECORD_RETENTION_DAYS", DEFAULT_DATA_RETENTION_DAYS.recruitingRecords),
  submissions: parseRetentionOverride("SUBMISSION_RETENTION_DAYS", DEFAULT_DATA_RETENTION_DAYS.submissions),
  loginEvents: parseRetentionOverride("LOGIN_EVENT_RETENTION_DAYS", DEFAULT_DATA_RETENTION_DAYS.loginEvents),
} as const;

export type DataRetentionKey = keyof typeof DATA_RETENTION_DAYS;

/**
 * When true, all automatic data pruning is suspended.  Set via the
 * `DATA_RETENTION_LEGAL_HOLD` environment variable.  Intended for
 * litigation holds, regulatory investigations, or any scenario where
 * data must not be deleted until the hold is lifted.
 *
 * Re-read from the environment on each call so that changing the env var
 * at runtime (e.g., Kubernetes ConfigMap rollout) takes effect on the next
 * prune cycle without requiring a process restart. Previously this was a
 * module-level constant, which meant runtime env-var changes were invisible
 * until the next deploy.
 */
export function isDataRetentionLegalHold(): boolean {
  return process.env.DATA_RETENTION_LEGAL_HOLD === "true" ||
    process.env.DATA_RETENTION_LEGAL_HOLD === "1";
}

// The deprecated module-level constant DATA_RETENTION_LEGAL_HOLD was removed in
// favour of isDataRetentionLegalHold() which re-reads the env var at runtime.
// See commit ad6fe8f4.

/**
 * Compute the cutoff Date before which data is eligible for pruning.
 *
 * @param days - Retention period in days.
 * @param now - Current time in ms. Server-side callers MUST use `getDbNowMs()`
 *   (or `(await getDbNow()).getTime()`) to avoid clock skew between the app
 *   server and the database server. Data timestamps are stored using DB server
 *   time, so the cutoff must be computed against the same clock to prevent
 *   premature deletion or delayed pruning.
 */
export function getRetentionCutoff(days: number, now: number) {
  return new Date(now - days * 24 * 60 * 60 * 1000);
}
