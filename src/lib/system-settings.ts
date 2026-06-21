import { cache } from "react";
import { eq } from "drizzle-orm";
import { DEFAULT_TIME_ZONE } from "@/lib/datetime";
import { db } from "@/lib/db";
import { systemSettings, smtpSettings, uiContentSettings } from "@/lib/db/schema";
import type { PlatformMode } from "@/types";
import {
  DEFAULT_PLATFORM_MODE,
  getPlatformModePolicy,
  PLATFORM_MODE_VALUES,
} from "@/lib/platform-mode";

const GLOBAL_SETTINGS_ID = "global";
export const DEFAULT_SYSTEM_TIME_ZONE = DEFAULT_TIME_ZONE;

export type SystemSettingsRecord = {
  id: string;
  siteTitle: string | null;
  siteDescription: string | null;
  siteIconUrl: string | null;
  timeZone: string | null;
  platformMode?: PlatformMode | null;
  aiAssistantEnabled?: boolean | null;
  allowAiAssistantInRestrictedModes?: boolean | null;
  allowStandaloneCompilerInRestrictedModes?: boolean | null;
  publicSignupEnabled?: boolean | null;
  signupHcaptchaEnabled?: boolean | null;
  hcaptchaSiteKey?: string | null;
  hcaptchaSecret?: string | null;
  defaultLanguage?: string | null;
  defaultLocale?: string | null;
  updatedAt: Date;
  allowedHosts?: string | null;
  homePageContent?: Record<string, {
    eyebrow?: string;
    title?: string;
    description?: string;
    cards?: {
      practice?: { title?: string; description?: string };
      playground?: { title?: string; description?: string };
      contests?: { title?: string; description?: string };
      community?: { title?: string; description?: string };
    };
  }> | null;
  footerContent?: Record<string, {
    copyrightText?: string;
    links?: { label: string; url: string }[];
  }> | null;
  // Rate Limiting
  loginRateLimitMaxAttempts?: number | null;
  loginRateLimitWindowMs?: number | null;
  loginRateLimitBlockMs?: number | null;
  apiRateLimitMax?: number | null;
  apiRateLimitWindowMs?: number | null;
  submissionRateLimitMaxPerMinute?: number | null;
  submissionMaxPending?: number | null;
  submissionGlobalQueueLimit?: number | null;
  // Judge Defaults
  defaultTimeLimitMs?: number | null;
  defaultMemoryLimitMb?: number | null;
  maxSourceCodeSizeBytes?: number | null;
  staleClaimTimeoutMs?: number | null;
  // Session & Auth
  sessionMaxAgeSeconds?: number | null;
  minPasswordLength?: number | null;
  // Pagination
  defaultPageSize?: number | null;
  // Real-time / SSE
  maxSseConnectionsPerUser?: number | null;
  ssePollIntervalMs?: number | null;
  sseTimeoutMs?: number | null;
  // Compiler
  compilerTimeLimitMs?: number | null;
  // File Uploads
  uploadMaxImageSizeBytes?: number | null;
  uploadMaxFileSizeBytes?: number | null;
  uploadMaxImageDimension?: number | null;
  uploadMaxZipDecompressedSizeBytes?: number | null;
  // SMTP Configuration
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean | null;
  smtpUser?: string | null;
  smtpPass?: string | null;
  smtpFrom?: string | null;
  emailVerificationRequired?: boolean | null;
  communityUpvoteEnabled?: boolean | null;
  communityDownvoteEnabled?: boolean | null;
};

async function getSmtpSettingsRow() {
  try {
    return await db.query.smtpSettings.findFirst({
      where: eq(smtpSettings.id, GLOBAL_SETTINGS_ID),
    });
  } catch {
    // Table may not exist yet (migration lag). SMTP fields degrade to null.
    return undefined;
  }
}

async function getUiContentSettingsRow() {
  try {
    return await db.query.uiContentSettings.findFirst({
      where: eq(uiContentSettings.id, GLOBAL_SETTINGS_ID),
    });
  } catch {
    // Table may not exist yet (migration lag). UI content degrades to null.
    return undefined;
  }
}

/**
 * Merge the SMTP and UI-content domain tables onto a base system_settings row,
 * preserving the flat SystemSettingsRecord shape that callers depend on. The
 * SMTP config and UI content were split out of the system_settings god-table
 * but the read facade stays identical.
 */
function mergeDomainSettings(
  base: Record<string, unknown>,
  smtp: Awaited<ReturnType<typeof getSmtpSettingsRow>>,
  ui: Awaited<ReturnType<typeof getUiContentSettingsRow>>,
): SystemSettingsRecord {
  return {
    ...(base as SystemSettingsRecord),
    smtpHost: smtp?.smtpHost ?? null,
    smtpPort: smtp?.smtpPort ?? null,
    smtpSecure: smtp?.smtpSecure ?? null,
    smtpUser: smtp?.smtpUser ?? null,
    smtpPass: smtp?.smtpPass ?? null,
    smtpFrom: smtp?.smtpFrom ?? null,
    emailVerificationRequired: smtp?.emailVerificationRequired ?? null,
    homePageContent: ui?.homePageContent ?? null,
    footerContent: ui?.footerContent ?? null,
  };
}

export async function getSystemSettings(): Promise<SystemSettingsRecord | undefined> {
  const [smtp, ui] = await Promise.all([getSmtpSettingsRow(), getUiContentSettingsRow()]);

  try {
    const base = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, GLOBAL_SETTINGS_ID),
    });
    if (!base) return undefined;
    return mergeDomainSettings(base, smtp, ui);
  } catch {
    // Fallback: query without new columns (a migration may not have run yet).
    const rows = await db
      .select({
        id: systemSettings.id,
        siteTitle: systemSettings.siteTitle,
        siteDescription: systemSettings.siteDescription,
        siteIconUrl: systemSettings.siteIconUrl,
        timeZone: systemSettings.timeZone,
        updatedAt: systemSettings.updatedAt,
        aiAssistantEnabled: systemSettings.aiAssistantEnabled,
      })
      .from(systemSettings)
      .where(eq(systemSettings.id, GLOBAL_SETTINGS_ID))
      .limit(1);

    const partial = rows[0];
    if (!partial) return undefined;

    // Remaining fields are optional on SystemSettingsRecord; absent values are
    // treated identically to null by callers (they all read with `?? default`).
    return mergeDomainSettings(partial, smtp, ui);
  }
}

export const getResolvedSystemSettings = cache(async (defaults: {
  siteTitle: string;
  siteDescription: string;
  timeZone?: string;
}) => {
  const settings = await getSystemSettings();

  return {
    siteTitle: settings?.siteTitle ?? defaults.siteTitle,
    siteDescription: settings?.siteDescription ?? defaults.siteDescription,
    siteIconUrl: settings?.siteIconUrl ?? null,
    timeZone: settings?.timeZone ?? defaults.timeZone ?? DEFAULT_SYSTEM_TIME_ZONE,
    platformMode: settings?.platformMode ?? DEFAULT_PLATFORM_MODE,
    aiAssistantEnabled: settings?.aiAssistantEnabled ?? true,
    publicSignupEnabled: settings?.publicSignupEnabled ?? false,
    signupHcaptchaEnabled: settings?.signupHcaptchaEnabled ?? false,
    defaultLanguage: settings?.defaultLanguage ?? null,
    defaultLocale: settings?.defaultLocale ?? null,
    homePageContent: settings?.homePageContent ?? null,
    footerContent: settings?.footerContent ?? null,
  };
});

/**
 * Resolve the EFFECTIVE platform-mode restrictions for a given mode, applying
 * the admin override flags. A restricted mode (exam/contest/recruiting) derives
 * `restrictAiByDefault` / `restrictStandaloneCompiler`; each is suppressed when
 * the matching `allow*InRestrictedModes` setting is enabled. The default (false)
 * keeps the mode's safe anti-cheat behaviour, so callers that simply read these
 * flags behave exactly as before unless an admin opts out.
 */
export async function getEffectiveModeRestrictions(
  mode: PlatformMode,
  preloadedSettings?: SystemSettingsRecord | undefined
): Promise<{ restrictAiByDefault: boolean; restrictStandaloneCompiler: boolean }> {
  const base = getPlatformModePolicy(mode);
  // Callers that already hold the settings record pass it to avoid a second
  // settings query per resolution (getSystemSettings is not memoized).
  const settings = preloadedSettings ?? (await getSystemSettings());
  return {
    restrictAiByDefault:
      base.restrictAiByDefault && !(settings?.allowAiAssistantInRestrictedModes ?? false),
    restrictStandaloneCompiler:
      base.restrictStandaloneCompiler && !(settings?.allowStandaloneCompilerInRestrictedModes ?? false),
  };
}

export async function isAiAssistantEnabled(): Promise<boolean> {
  try {
    const settings = await getSystemSettings();
    const platformMode = settings?.platformMode ?? DEFAULT_PLATFORM_MODE;
    // The platform mode forces AI off in restricted modes UNLESS the admin has
    // explicitly opted out via allowAiAssistantInRestrictedModes. Single source
    // of truth for that rule: getEffectiveModeRestrictions (do not re-derive
    // the override inline — see also isAiAssistantEnabledForContext). The
    // already-fetched settings are passed through to avoid a second query.
    const { restrictAiByDefault } = await getEffectiveModeRestrictions(platformMode, settings);
    if (restrictAiByDefault) return false;
    return settings?.aiAssistantEnabled ?? true;
  } catch {
    // DB-failure safe default (pre-c8d06661 contract): degrade to the
    // DEFAULT_PLATFORM_MODE policy instead of propagating a DB outage into
    // page rendering. getSystemSettings' own catch only covers the
    // missing-column fallback query; if BOTH queries throw we land here.
    return !getPlatformModePolicy(DEFAULT_PLATFORM_MODE).restrictAiByDefault;
  }
}

export async function getResolvedSystemTimeZone() {
  const settings = await getSystemSettings();

  return settings?.timeZone ?? DEFAULT_SYSTEM_TIME_ZONE;
}

export async function getResolvedPlatformMode() {
  const settings = await getSystemSettings();

  return settings?.platformMode ?? DEFAULT_PLATFORM_MODE;
}

export { GLOBAL_SETTINGS_ID };
export { DEFAULT_PLATFORM_MODE, PLATFORM_MODE_VALUES, getPlatformModePolicy };
