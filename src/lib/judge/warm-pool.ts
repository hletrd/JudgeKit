import { JUDGE_LANGUAGE_CONFIGS } from "@/lib/judge/languages";

/**
 * Admin-facing warm-pool configuration, stored as JSONB in
 * `system_settings.warm_pool`. Counts are keyed by LANGUAGE because that is
 * what an admin picks; normalization to docker images happens in
 * `resolveWarmPoolTargets` (C and C++ share `judge-cpp:latest`).
 */
export interface WarmPoolConfig {
  enabled: boolean;
  /** language key -> desired idle warm-container count (0 = off) */
  languages: Record<string, number>;
}

/** What the worker actually reconciles against: idle containers per image. */
export interface WarmPoolTargets {
  enabled: boolean;
  /** docker image -> desired idle warm-container count */
  images: Record<string, number>;
}

/** Per-image ceiling — bounds idle RAM/PID usage on the worker host. */
export const WARM_POOL_MAX_PER_IMAGE = 8;
/** Fleet-wide ceiling across all images on a single worker. */
export const WARM_POOL_MAX_TOTAL = 24;

/**
 * Default config used until an admin saves an explicit value. Enabled only
 * when the deployment opts in via `WARM_POOL_DEFAULT_ENABLED=true` (set for
 * the oj/auraedu app environment), so other deployments stay off by default.
 */
export function defaultWarmPoolConfig(): WarmPoolConfig {
  return {
    enabled: process.env.WARM_POOL_DEFAULT_ENABLED === "true",
    languages: { python: 2, cpp20: 2, c17: 2 },
  };
}

export function languageToImage(language: string): string | undefined {
  const entry = JUDGE_LANGUAGE_CONFIGS[language as keyof typeof JUDGE_LANGUAGE_CONFIGS];
  return entry?.dockerImage;
}

/**
 * Admin-editable `language_configs.docker_image` per language, as read from the
 * DB. `null`/`undefined`/empty means "no override stored for this language".
 */
export type WarmPoolLanguageImages = ReadonlyMap<string, string | null | undefined>;

/**
 * The image a submission in `language` will ACTUALLY run in.
 *
 * The worker runs `submission.docker_image`, which the claim route fills from
 * the admin-editable `language_configs.docker_image` column and only falls back
 * to the static mapping when that column is empty. Warming anything else warms
 * an image nobody asks for: `pool.acquire()` would miss forever, every run
 * would silently go cold, and the idle containers would just hold memory.
 * So this resolution must stay identical to the claim route's.
 */
export function resolveLanguageImage(
  language: string,
  dbImage?: string | null,
): string | undefined {
  const override = dbImage?.trim();
  if (override) return override;
  return languageToImage(language);
}

/**
 * Convert admin per-language counts into per-image targets.
 *
 * Counts for languages sharing an image are merged with MAX (not sum): a warm
 * `judge-cpp:latest` container can serve a C submission or a C++ one, so
 * provisioning both separately would double-allocate idle containers. The merge
 * happens per RESOLVED image, so retagging just one of two languages that used
 * to share an image correctly splits them into two pools.
 *
 * `languageImages` carries the DB overrides; a language missing from it (or
 * stored empty) falls back to the static mapping, exactly like the claim route.
 */
export function resolveWarmPoolTargets(
  config: WarmPoolConfig | null | undefined,
  enabledLanguages: ReadonlySet<string>,
  languageImages?: WarmPoolLanguageImages,
): WarmPoolTargets {
  if (!config || !config.enabled) {
    return { enabled: false, images: {} };
  }

  const merged: Record<string, number> = {};
  for (const [language, rawCount] of Object.entries(config.languages ?? {})) {
    if (!enabledLanguages.has(language)) continue;
    const image = resolveLanguageImage(language, languageImages?.get(language));
    if (!image) continue;
    const count = Math.min(WARM_POOL_MAX_PER_IMAGE, Math.floor(Number(rawCount) || 0));
    if (count <= 0) continue;
    merged[image] = Math.max(merged[image] ?? 0, count);
  }

  // Apply the fleet-wide cap deterministically (sorted by image name) so the
  // same config always yields the same targets across workers and restarts.
  const images: Record<string, number> = {};
  let total = 0;
  for (const image of Object.keys(merged).sort()) {
    if (total >= WARM_POOL_MAX_TOTAL) break;
    const allowed = Math.min(merged[image], WARM_POOL_MAX_TOTAL - total);
    if (allowed > 0) {
      images[image] = allowed;
      total += allowed;
    }
  }

  return { enabled: true, images };
}
