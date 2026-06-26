import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { systemSettings, users } from "@/lib/db/schema";
import { DEFAULT_PLATFORM_MODE, getSystemSettings, GLOBAL_SETTINGS_ID } from "@/lib/system-settings";
import { invalidateSettingsCache } from "@/lib/system-settings-config";
import { isHcaptchaConfigured } from "@/lib/security/hcaptcha";
import { encrypt, redactSecret } from "@/lib/security/encryption";
import { verifyAndRehashPassword } from "@/lib/security/password-hash";
import { SECRET_SETTINGS_KEYS } from "@/lib/security/secrets";
import { systemSettingsSchema } from "@/lib/validators/system-settings";
import { getDbNowUncached } from "@/lib/db-time";
import { recordAuditEventDurable } from "@/lib/audit/events";

/**
 * Settings keys that affect security posture. Mutating any of these requires
 * password reconfirmation so a stolen session cookie cannot silently weaken
 * the platform (disable hCaptcha, raise rate limits, open public signup,
 * widen allowedHosts, etc.). Mirrors the restore/backup/migrate reconfirm
 * gate. See C3-AGG-7 / NEW-M5.
 */
const SENSITIVE_SETTINGS_KEYS = [
  "platformMode",
  "allowedHosts",
  "publicSignupEnabled",
  "emailVerificationRequired",
  "signupHcaptchaEnabled",
  "hcaptchaSiteKey",
  "hcaptchaSecret",
  "communityUpvoteEnabled",
  "communityDownvoteEnabled",
  "smtpPass",
  "loginRateLimitMaxAttempts",
  "loginRateLimitWindowMs",
  "loginRateLimitBlockMs",
  "apiRateLimitMax",
  "apiRateLimitWindowMs",
  "submissionRateLimitMaxPerMinute",
  "submissionMaxPending",
  "sessionMaxAgeSeconds",
] as const;

function redactSecretSettings(settings: Record<string, unknown>): void {
  for (const key of SECRET_SETTINGS_KEYS) {
    if (settings[key]) {
      settings[key] = redactSecret(settings[key] as string);
    }
  }
}

export const GET = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  handler: async (req: NextRequest, { user }) => {
    void req;
    void user;
    const settings = await getSystemSettings();
    // Never expose the full secret in API responses
    if (settings) {
      redactSecretSettings(settings as Record<string, unknown>);
    }
    return apiSuccess(settings ?? {});
  },
});

export const PUT = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  schema: systemSettingsSchema,
  handler: async (req: NextRequest, { user, body }) => {
    const {
      siteTitle,
      siteDescription,
      siteIconUrl,
      timeZone,
      platformMode,
      aiAssistantEnabled,
      allowAiAssistantInRestrictedModes,
      allowStandaloneCompilerInRestrictedModes,
      publicSignupEnabled,
      signupHcaptchaEnabled,
      hcaptchaSiteKey,
      hcaptchaSecret,
      allowedHosts,
      currentPassword,
      ...restConfig
    } = body;

    // Password reconfirmation when the PUT touches any privilege-affecting
    // key (C3-AGG-7 / NEW-M5). Mirrors the restore/backup/migrate gate.
    const touchesSensitiveKey = SENSITIVE_SETTINGS_KEYS.some(
      (key) => (body as Record<string, unknown>)[key] !== undefined
    );
    if (touchesSensitiveKey) {
      if (!currentPassword) {
        return NextResponse.json({ error: "passwordReconfirmRequired" }, { status: 401 });
      }
      const [dbUser] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      if (!dbUser?.passwordHash) {
        return NextResponse.json({ error: "authenticationFailed" }, { status: 403 });
      }
      const { valid } = await verifyAndRehashPassword(currentPassword, user.id, dbUser.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "invalidPassword" }, { status: 403 });
      }
    }

    const hasNewKeys = (hcaptchaSiteKey && hcaptchaSiteKey.length > 0) || (hcaptchaSecret && hcaptchaSecret.length > 0);
    if (signupHcaptchaEnabled && !hasNewKeys && !(await isHcaptchaConfigured())) {
      return NextResponse.json({ error: "signupHcaptchaUnavailable" }, { status: 400 });
    }

    // Explicitly enumerate allowed numeric config keys to prevent arbitrary field injection
    const allowedConfigKeys = [
      "defaultLanguage",
      "loginRateLimitMaxAttempts", "loginRateLimitWindowMs", "loginRateLimitBlockMs",
      "apiRateLimitMax", "apiRateLimitWindowMs",
      "submissionRateLimitMaxPerMinute", "submissionMaxPending", "submissionGlobalQueueLimit",
      "defaultTimeLimitMs", "defaultMemoryLimitMb", "maxSourceCodeSizeBytes", "staleClaimTimeoutMs",
      "sessionMaxAgeSeconds",
      "defaultPageSize",
      "maxSseConnectionsPerUser", "ssePollIntervalMs", "sseTimeoutMs",
      "compilerTimeLimitMs",
      "uploadMaxImageSizeBytes", "uploadMaxFileSizeBytes", "uploadMaxImageDimension",
      "uploadMaxZipDecompressedSizeBytes",
    ] as const;

    const filteredConfig = Object.fromEntries(
      Object.entries(restConfig).filter(([k]) => (allowedConfigKeys as readonly string[]).includes(k))
    );

    const baseValues: Record<string, unknown> = {
      siteTitle: siteTitle ?? null,
      siteDescription: siteDescription ?? null,
      siteIconUrl: siteIconUrl ?? null,
      timeZone: timeZone ?? null,
      platformMode: platformMode ?? DEFAULT_PLATFORM_MODE,
      aiAssistantEnabled: aiAssistantEnabled ?? true,
      allowAiAssistantInRestrictedModes: allowAiAssistantInRestrictedModes ?? false,
      allowStandaloneCompilerInRestrictedModes: allowStandaloneCompilerInRestrictedModes ?? false,
      publicSignupEnabled: publicSignupEnabled ?? false,
      signupHcaptchaEnabled: signupHcaptchaEnabled ?? false,
      hcaptchaSiteKey: hcaptchaSiteKey ?? null,
      hcaptchaSecret: hcaptchaSecret ? encrypt(hcaptchaSecret) : null,
      updatedAt: await getDbNowUncached(),
    };

    // Add numeric config values (undefined = not in payload, null = clear to default)
    for (const [key, val] of Object.entries(filteredConfig)) {
      if (val !== undefined) {
        baseValues[key] = val;
      }
    }

    if (allowedHosts !== undefined) {
      baseValues.allowedHosts = allowedHosts.length > 0 ? JSON.stringify(allowedHosts) : null;
    }

    await db
      .insert(systemSettings)
      .values({ id: GLOBAL_SETTINGS_ID, ...baseValues })
      .onConflictDoUpdate({
        target: systemSettings.id,
        set: baseValues,
      });

    invalidateSettingsCache();

    await recordAuditEventDurable({
      actorId: user.id,
      actorRole: user.role,
      action: "system_settings.updated",
      resourceType: "system_settings",
      resourceId: GLOBAL_SETTINGS_ID,
      resourceLabel: "Global settings",
      summary: "Updated global system settings via API",
      details: {
        siteTitle: siteTitle ?? null,
        siteDescription: siteDescription ?? null,
        timeZone: timeZone ?? null,
        platformMode: platformMode ?? DEFAULT_PLATFORM_MODE,
        aiAssistantEnabled: aiAssistantEnabled ?? true,
        publicSignupEnabled: publicSignupEnabled ?? false,
        signupHcaptchaEnabled: signupHcaptchaEnabled ?? false,
        hcaptchaSiteKey: hcaptchaSiteKey ?? null,
        hcaptchaSecret: typeof hcaptchaSecret === "string" && hcaptchaSecret.length > 0 ? "••••••••" : null,
      },
      request: req,
    });

    const updated = await getSystemSettings();
    // Never expose the full secret in API responses
    if (updated) {
      redactSecretSettings(updated as Record<string, unknown>);
    }
    return apiSuccess(updated ?? {});
  },
});
