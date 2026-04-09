import { db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const GLOBAL_SETTINGS_ID = "global";
const CACHE_TTL_MS = 60_000;

export type ConfiguredSettings = {
  loginRateLimitMaxAttempts: number;
  loginRateLimitWindowMs: number;
  loginRateLimitBlockMs: number;
  apiRateLimitMax: number;
  apiRateLimitWindowMs: number;
  submissionRateLimitMaxPerMinute: number;
  submissionMaxPending: number;
  submissionGlobalQueueLimit: number;
  defaultTimeLimitMs: number;
  defaultMemoryLimitMb: number;
  maxSourceCodeSizeBytes: number;
  staleClaimTimeoutMs: number;
  sessionMaxAgeSeconds: number;
  minPasswordLength: number;
  defaultPageSize: number;
  maxSseConnectionsPerUser: number;
  ssePollIntervalMs: number;
  sseTimeoutMs: number;
  // Compiler
  compilerTimeLimitMs: number;
  // File Uploads
  uploadMaxImageSizeBytes: number;
  uploadMaxFileSizeBytes: number;
  uploadMaxImageDimension: number;
};

const DEFAULTS: ConfiguredSettings = {
  loginRateLimitMaxAttempts: 5,
  loginRateLimitWindowMs: 60_000,
  loginRateLimitBlockMs: 900_000,
  apiRateLimitMax: 30,
  apiRateLimitWindowMs: 60_000,
  submissionRateLimitMaxPerMinute: 120,
  submissionMaxPending: 3,
  submissionGlobalQueueLimit: 100,
  defaultTimeLimitMs: 2_000,
  defaultMemoryLimitMb: 256,
  maxSourceCodeSizeBytes: 256 * 1024,
  staleClaimTimeoutMs: 300_000,
  sessionMaxAgeSeconds: 14 * 24 * 60 * 60,
  minPasswordLength: 8,
  defaultPageSize: 25,
  maxSseConnectionsPerUser: 5,
  ssePollIntervalMs: 2_000,
  sseTimeoutMs: 300_000,
  compilerTimeLimitMs: 10_000,
  // File Uploads
  uploadMaxImageSizeBytes: 10 * 1024 * 1024,
  uploadMaxFileSizeBytes: 50 * 1024 * 1024,
  uploadMaxImageDimension: 4096,
};

/** Environment variable overrides — maps setting key to env var name */
const ENV_OVERRIDES: Partial<Record<keyof ConfiguredSettings, string>> = {
  loginRateLimitMaxAttempts: "RATE_LIMIT_MAX_ATTEMPTS",
  loginRateLimitWindowMs: "RATE_LIMIT_WINDOW_MS",
  loginRateLimitBlockMs: "RATE_LIMIT_BLOCK_MS",
  apiRateLimitMax: "API_RATE_LIMIT_MAX",
  apiRateLimitWindowMs: "API_RATE_LIMIT_WINDOW_MS",
  submissionRateLimitMaxPerMinute: "SUBMISSION_RATE_LIMIT_MAX_PER_MINUTE",
  submissionMaxPending: "SUBMISSION_MAX_PENDING",
  submissionGlobalQueueLimit: "SUBMISSION_GLOBAL_QUEUE_LIMIT",
  staleClaimTimeoutMs: "JUDGE_STALE_CLAIM_TIMEOUT_MS",
  compilerTimeLimitMs: "COMPILER_TIME_LIMIT_MS",
  uploadMaxImageSizeBytes: "UPLOAD_MAX_IMAGE_SIZE_BYTES",
  uploadMaxFileSizeBytes: "UPLOAD_MAX_FILE_SIZE_BYTES",
  uploadMaxImageDimension: "UPLOAD_MAX_IMAGE_DIMENSION",
};

let cached: ConfiguredSettings | null = null;
let cachedAt = 0;
let _initPromise: Promise<void> | null = null;
let _initialized = false;

function resolveValue(
  key: keyof ConfiguredSettings,
  dbValue: number | null | undefined,
): number {
  // Priority 1: Environment variable
  const envKey = ENV_OVERRIDES[key];
  if (envKey) {
    const envVal = process.env[envKey];
    if (envVal !== undefined && envVal !== "") {
      const parsed = parseInt(envVal, 10);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }

  // Priority 2: DB value (non-null)
  if (dbValue != null) return dbValue;

  // Priority 3: Hardcoded default
  return DEFAULTS[key];
}

async function loadFromDb(): Promise<ConfiguredSettings> {
  try {
    const row = (await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.id, GLOBAL_SETTINGS_ID))
      .limit(1))[0];

    const settings = {} as ConfiguredSettings;
    for (const key of Object.keys(DEFAULTS) as (keyof ConfiguredSettings)[]) {
      const dbVal = row ? (row as Record<string, unknown>)[key] as number | null | undefined : undefined;
      settings[key] = resolveValue(key, dbVal);
    }
    return settings;
  } catch {
    // If DB is unavailable or columns don't exist yet, use env + defaults
    const settings = {} as ConfiguredSettings;
    for (const key of Object.keys(DEFAULTS) as (keyof ConfiguredSettings)[]) {
      settings[key] = resolveValue(key, undefined);
    }
    return settings;
  }
}

/**
 * Await the first DB load so that admin-configured settings are available
 * before any request is served. Call this during app startup (e.g. in
 * instrumentation.ts `register()`).
 */
export async function initializeSettings(): Promise<void> {
  if (_initialized) return;
  if (!_initPromise) {
    _initPromise = loadFromDb()
      .then((settings) => {
        cached = settings;
        cachedAt = Date.now();
        _initialized = true;
      })
      .catch(() => {
        // On error, seal defaults so callers aren't stuck on null
        if (!cached) cached = { ...DEFAULTS } as ConfiguredSettings;
        _initialized = true;
      });
  }
  await _initPromise;
}

/**
 * Returns resolved settings with 60s in-memory cache.
 * Resolution order: process.env > DB value (if non-null) > hardcoded default.
 */
export function getConfiguredSettings(): ConfiguredSettings {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) {
    return cached;
  }
  // Trigger async reload in background; return cached or defaults until ready
  if (!_refreshing) {
    _refreshing = true;
    loadFromDb()
      .then((settings) => {
        cached = settings;
        cachedAt = Date.now();
      })
      .catch(() => {
        // On error, use defaults
        if (!cached) cached = { ...DEFAULTS } as ConfiguredSettings;
      })
      .finally(() => {
        _refreshing = false;
      });
  }
  // Return current cache or defaults while async load is in progress
  return cached ?? ({ ...DEFAULTS } as ConfiguredSettings);
}

let _refreshing = false;

/** Call after admin updates settings to force immediate reload. */
export function invalidateSettingsCache(): void {
  cached = null;
  cachedAt = 0;
}

/** Exposed for use in the admin UI to show defaults. */
export { DEFAULTS as SETTING_DEFAULTS };
