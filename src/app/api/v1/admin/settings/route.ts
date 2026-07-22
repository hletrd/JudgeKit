import { NextRequest, NextResponse } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";
import { DEFAULT_PLATFORM_MODE, getSystemSettings, GLOBAL_SETTINGS_ID } from "@/lib/system-settings";
import { invalidateSettingsCache } from "@/lib/system-settings-config";
import { isHcaptchaConfigured } from "@/lib/security/hcaptcha";
import { encrypt, redactSecret } from "@/lib/security/encryption";
import { SECRET_SETTINGS_KEYS } from "@/lib/security/secrets";
import {
  requireSettingsReconfirm,
  settingsReconfirmToResponse,
} from "@/lib/security/sensitive-settings";
import { systemSettingsSchema } from "@/lib/validators/system-settings";
import { getDbNowUncached } from "@/lib/db-time";
import { recordAuditEventDurable } from "@/lib/audit/events";

// `SENSITIVE_SETTINGS_KEYS` + the reconfirm gate now live in
// `@/lib/security/sensitive-settings` and are shared with the server action so
// the gate cannot drift between the two writers (ARCH-1).

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
      sessionMaxAgeSeconds,
      emailVerificationRequired,
      autoCodeReviewEnabled,
      ...restConfig
    } = body;
    // `currentPassword` stays in `restConfig`; the shared reconfirm helper reads
    // it from `body`, and the allowedConfigKeys filter drops it before write.

    // Password reconfirmation when the PUT touches any privilege-affecting
    // key. The shared `requireSettingsReconfirm` helper + SENSITIVE_SETTINGS_KEYS
    // are now used by BOTH the REST route and the server action so the gate
    // cannot drift between writers (ARCH-1, C3-AGG-7, C4-3).
    const reconfirmResponse = settingsReconfirmToResponse(
      await requireSettingsReconfirm(body, user),
    );
    if (reconfirmResponse) {
      return reconfirmResponse;
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
      "warmPool",
    ] as const;

    const filteredConfig = Object.fromEntries(
      Object.entries(restConfig).filter(([k]) => (allowedConfigKeys as readonly string[]).includes(k))
    );

    // Only write a field when it was actually supplied. The unconditional
    // `baseValues` previously defaulted every field on each PUT, so a request
    // touching only `{ siteTitle }` silently wiped `hcaptchaSecret`,
    // `publicSignupEnabled`, `platformMode`, etc. — and that side-effect wipe
    // also bypassed the reconfirm gate (the body carried no sensitive key yet
    // cleared sensitive columns). Mirrors the `hasOwnInput` guard already used
    // by the twin server action (C4-N1).
    const hasOwnInput = (key: string) =>
      Object.prototype.hasOwnProperty.call(body, key);

    const baseValues: Record<string, unknown> = {
      updatedAt: await getDbNowUncached(),
    };

    if (hasOwnInput("siteTitle")) {
      baseValues.siteTitle = siteTitle ?? null;
    }
    if (hasOwnInput("siteDescription")) {
      baseValues.siteDescription = siteDescription ?? null;
    }
    if (hasOwnInput("siteIconUrl")) {
      baseValues.siteIconUrl = siteIconUrl ?? null;
    }
    if (hasOwnInput("timeZone")) {
      baseValues.timeZone = timeZone ?? null;
    }
    if (hasOwnInput("platformMode")) {
      baseValues.platformMode = platformMode ?? DEFAULT_PLATFORM_MODE;
    }
    if (hasOwnInput("aiAssistantEnabled")) {
      baseValues.aiAssistantEnabled = aiAssistantEnabled ?? true;
    }
    if (hasOwnInput("allowAiAssistantInRestrictedModes")) {
      baseValues.allowAiAssistantInRestrictedModes = allowAiAssistantInRestrictedModes ?? false;
    }
    if (hasOwnInput("allowStandaloneCompilerInRestrictedModes")) {
      baseValues.allowStandaloneCompilerInRestrictedModes =
        allowStandaloneCompilerInRestrictedModes ?? false;
    }
    if (hasOwnInput("sessionMaxAgeSeconds")) {
      baseValues.sessionMaxAgeSeconds = sessionMaxAgeSeconds ?? null;
    }
    if (hasOwnInput("emailVerificationRequired")) {
      baseValues.emailVerificationRequired = emailVerificationRequired ?? false;
    }
    if (hasOwnInput("autoCodeReviewEnabled")) {
      baseValues.autoCodeReviewEnabled = autoCodeReviewEnabled ?? true;
    }
    if (hasOwnInput("publicSignupEnabled")) {
      baseValues.publicSignupEnabled = publicSignupEnabled ?? false;
    }
    if (hasOwnInput("signupHcaptchaEnabled")) {
      baseValues.signupHcaptchaEnabled = signupHcaptchaEnabled ?? false;
    }
    if (hasOwnInput("hcaptchaSiteKey")) {
      baseValues.hcaptchaSiteKey = hcaptchaSiteKey ?? null;
    }
    if (hasOwnInput("hcaptchaSecret")) {
      baseValues.hcaptchaSecret = hcaptchaSecret ? encrypt(hcaptchaSecret) : null;
    }

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

    await invalidateSettingsCache();

    await recordAuditEventDurable({
      actorId: user.id,
      actorRole: user.role,
      action: "system_settings.updated",
      resourceType: "system_settings",
      resourceId: GLOBAL_SETTINGS_ID,
      resourceLabel: "Global settings",
      summary: "Updated global system settings via API",
      // Audit only what was actually written. After the C4-N1 `hasOwnInput`
      // partial-update fix, omitted fields are no longer persisted, so recording
      // their destructured-with-defaults values here produced a false positive
      // ("did this PUT change platformMode?" — the audit row claimed it did,
      // with the default value, even though the column was untouched). Gate each
      // detail key on `hasOwnInput` to mirror `baseValues`. (C5-N2)
      details: {
        ...(hasOwnInput("siteTitle") ? { siteTitle: siteTitle ?? null } : {}),
        ...(hasOwnInput("siteDescription") ? { siteDescription: siteDescription ?? null } : {}),
        ...(hasOwnInput("timeZone") ? { timeZone: timeZone ?? null } : {}),
        ...(hasOwnInput("platformMode") ? { platformMode: platformMode ?? DEFAULT_PLATFORM_MODE } : {}),
        ...(hasOwnInput("aiAssistantEnabled") ? { aiAssistantEnabled: aiAssistantEnabled ?? true } : {}),
        ...(hasOwnInput("publicSignupEnabled") ? { publicSignupEnabled: publicSignupEnabled ?? false } : {}),
        ...(hasOwnInput("signupHcaptchaEnabled") ? { signupHcaptchaEnabled: signupHcaptchaEnabled ?? false } : {}),
        ...(hasOwnInput("hcaptchaSiteKey") ? { hcaptchaSiteKey: hcaptchaSiteKey ?? null } : {}),
        ...(hasOwnInput("hcaptchaSecret")
          ? { hcaptchaSecret: typeof hcaptchaSecret === "string" && hcaptchaSecret.length > 0 ? "••••••••" : null }
          : {}),
        ...(hasOwnInput("allowedHosts") ? { allowedHosts: allowedHosts ?? null } : {}),
        ...(hasOwnInput("sessionMaxAgeSeconds") ? { sessionMaxAgeSeconds: sessionMaxAgeSeconds ?? null } : {}),
        ...(hasOwnInput("emailVerificationRequired")
          ? { emailVerificationRequired: emailVerificationRequired ?? false }
          : {}),
        ...(hasOwnInput("autoCodeReviewEnabled")
          ? { autoCodeReviewEnabled: autoCodeReviewEnabled ?? true }
          : {}),
        ...(hasOwnInput("allowStandaloneCompilerInRestrictedModes")
          ? { allowStandaloneCompilerInRestrictedModes: allowStandaloneCompilerInRestrictedModes ?? false }
          : {}),
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
