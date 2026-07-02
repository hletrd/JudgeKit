import { db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const GLOBAL_SETTINGS_ID = "global";
// Stale-while-revalidate window. On the instance that made the change,
// invalidateSettingsCache() forces an immediate reload; this TTL only bounds
// how long OTHER instances serve stale settings before a background refresh.
// Kept low so admin setting changes propagate across instances quickly; the
// cost is just a slightly more frequent background DB read.
const CACHE_TTL_MS = 15_000;

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
  maxJudgeClaimDurationMs: number;
  sessionMaxAgeSeconds: number;
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
  uploadMaxZipDecompressedSizeBytes: number;
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
  maxJudgeClaimDurationMs: 600_000,
  sessionMaxAgeSeconds: 14 * 24 * 60 * 60,
  defaultPageSize: 25,
  maxSseConnectionsPerUser: 5,
  ssePollIntervalMs: 2_000,
  sseTimeoutMs: 300_000,
  compilerTimeLimitMs: 10_000,
  // File Uploads
  uploadMaxImageSizeBytes: 10 * 1024 * 1024,
  uploadMaxFileSizeBytes: 50 * 1024 * 1024,
  uploadMaxImageDimension: 4096,
  uploadMaxZipDecompressedSizeBytes: 100 * 1024 * 1024,
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
  maxJudgeClaimDurationMs: "JUDGE_MAX_CLAIM_DURATION_MS",
  compilerTimeLimitMs: "COMPILER_TIME_LIMIT_MS",
  uploadMaxImageSizeBytes: "UPLOAD_MAX_IMAGE_SIZE_BYTES",
  uploadMaxFileSizeBytes: "UPLOAD_MAX_FILE_SIZE_BYTES",
  uploadMaxImageDimension: "UPLOAD_MAX_IMAGE_DIMENSION",
  uploadMaxZipDecompressedSizeBytes: "UPLOAD_MAX_ZIP_DECOMPRESSED_SIZE_BYTES",
};

let cached: ConfiguredSettings | null = null;
let cachedAt = 0;
let _initPromise: Promise<void> | null = null;
let _initialized = false;
let _refreshPromise: Promise<void> | null = null;

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
        if (!cached) cached = { ...DEFAULTS };
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
  // Cache is stale. Trigger an async reload in the background so the next
  // call sees fresh data, but return the last-known value (or defaults) now
  // to keep the synchronous API usable for hot-path callers such as auth
  // config and security constants.
  refreshSettings();
  return cached ?? { ...DEFAULTS };
}

let _refreshing = false;

async function refreshSettings(): Promise<void> {
  if (_refreshing) return;
  _refreshing = true;
  try {
    const settings = await loadFromDb();
    cached = settings;
    cachedAt = Date.now();
  } catch {
    if (!cached) cached = { ...DEFAULTS };
  } finally {
    _refreshing = false;
  }
}

/**
 * Force an immediate reload from the database and return a promise that settles
 * once the cache has been refreshed. Callers that must observe writes
 * synchronously (e.g. after updating settings) should `await` this call before
 * reading `getConfiguredSettings()`.
 */
export function invalidateSettingsCache(): Promise<void> {
  cachedAt = 0;
  if (!_refreshPromise) {
    _refreshPromise = refreshSettings().finally(() => {
      _refreshPromise = null;
    });
  }
  return _refreshPromise;
}

/** Exposed for use in the admin UI to show defaults. */
export { DEFAULTS as SETTING_DEFAULTS };
