/**
 * Central registry of all secret/sensitive columns and fields.
 *
 * This is the single source of truth for redaction configuration across:
 * - Logger redaction (src/lib/logger.ts)
 * - Database export sanitization (src/lib/db/export.ts)
 * - Admin settings API redaction (src/app/api/v1/admin/settings/route.ts)
 *
 * When adding a new secret field, update ONLY this file.
 */

/**
 * Table columns that are redacted in sanitized (portable) exports.
 * These columns are nullified when generating a sanitized database export.
 *
 * Note: judgeWorkers.secretTokenHash and judgeWorkers.judgeClaimToken are
 * included here (redacted in sanitized exports) but NOT in ALWAYS_REDACT
 * because they are retained in full-fidelity backups as a reference for
 * operators to re-provision workers after restore.
 */
export const EXPORT_SANITIZED_COLUMNS: Record<string, Set<string>> = {
  users: new Set(["passwordHash"]),
  sessions: new Set(["sessionToken"]),
  accounts: new Set(["refresh_token", "access_token", "id_token"]),
  apiKeys: new Set(["encryptedKey"]),
  judgeWorkers: new Set(["secretTokenHash", "judgeClaimToken"]),
  recruitingInvitations: new Set(["tokenHash"]),
  systemSettings: new Set(["hcaptchaSecret", "smtpPass"]),
  plugins: new Set(["config"]),
};

/**
 * Table columns that are ALWAYS redacted, even in full-fidelity backups.
 * These are the most sensitive fields that must never leave the system.
 */
export const EXPORT_ALWAYS_REDACT_COLUMNS: Record<string, Set<string>> = {
  users: new Set(["passwordHash"]),
  sessions: new Set(["sessionToken"]),
  accounts: new Set(["refresh_token", "access_token", "id_token"]),
  apiKeys: new Set(["encryptedKey"]),
  systemSettings: new Set(["hcaptchaSecret", "smtpPass"]),
};

/**
 * Pino logger redaction paths.
 * These object paths are censored in log output.
 */
export const LOGGER_REDACT_PATHS = [
  "authorization",
  "headers.authorization",
  "request.headers.authorization",
  "req.headers.authorization",
  "password",
  "passwordHash",
  "body.password",
  "body.passwordHash",
  "recruitAccountPassword",
  "recruitToken",
  "workerSecret",
  "judgeClaimToken",
  "sessionToken",
  "access_token",
  "refresh_token",
  "id_token",
  "config",
  "encryptedKey",
  "hcaptchaSecret",
  "body.hcaptchaSecret",
  "smtpPass",
  "body.smtpPass",
  "authToken",
  "runnerAuthToken",
];

/**
 * System settings keys that contain secrets and must be redacted in API responses.
 */
export const SECRET_SETTINGS_KEYS = ["hcaptchaSecret", "smtpPass"];
