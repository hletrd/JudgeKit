import { z } from "zod";
import { normalizeOptionalString } from "@/lib/validators/preprocess";

export const platformModeValues = ["homework", "exam", "contest", "recruiting"] as const;

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Nullable positive integer within bounds — null means "use default". */
function optionalInt(min: number, max: number) {
  return z
    .number()
    .int("mustBeInteger")
    .min(min, "valueTooSmall")
    .max(max, "valueTooLarge")
    .nullable()
    .optional();
}

const homePageCardSchema = z.object({
  title: z.string().max(100).optional(),
  description: z.string().max(300).optional(),
});

export const homePageLocaleSchema = z.object({
  eyebrow: z.string().max(100).optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  cards: z.object({
    practice: homePageCardSchema.optional(),
    playground: homePageCardSchema.optional(),
    contests: homePageCardSchema.optional(),
    community: homePageCardSchema.optional(),
  }).optional(),
});

export type HomePageLocaleContent = z.infer<typeof homePageLocaleSchema>;

const footerLinkSchema = z.object({
  label: z.string().max(100),
  url: z.string().max(2048),
});

export const footerLocaleSchema = z.object({
  copyrightText: z.string().max(200).optional(),
  links: z.array(footerLinkSchema).max(20).optional(),
});

export type FooterLocaleContent = z.infer<typeof footerLocaleSchema>;

export const systemSettingsSchema = z.object({
  // Optional current-password reconfirmation. Required when the PUT touches any
  // privilege-affecting key (see SENSITIVE_SETTINGS_KEYS in the route). Mirrors
  // the restore/backup/migrate reconfirm gate (C3-AGG-7 / NEW-M5).
  currentPassword: z.string().max(1_000).optional(),
  siteTitle: z.preprocess(
    normalizeOptionalString,
    z.string().max(100, "siteTitleTooLong").optional()
  ),
  siteDescription: z.preprocess(
    normalizeOptionalString,
    z.string().max(255, "siteDescriptionTooLong").optional()
  ),
  siteIconUrl: z.preprocess(
    normalizeOptionalString,
    z.string().max(2048, "siteIconUrlTooLong").optional()
  ),
  timeZone: z.preprocess(
    normalizeOptionalString,
    z
      .string()
      .max(100, "invalidTimeZone")
      .refine(isValidTimeZone, "invalidTimeZone")
      .optional()
  ),
  platformMode: z.enum(platformModeValues).optional(),
  aiAssistantEnabled: z.boolean().optional(),
  allowAiAssistantInRestrictedModes: z.boolean().optional(),
  allowStandaloneCompilerInRestrictedModes: z.boolean().optional(),
  publicSignupEnabled: z.boolean().optional(),
  emailVerificationRequired: z.boolean().optional(),
  communityUpvoteEnabled: z.boolean().optional(),
  communityDownvoteEnabled: z.boolean().optional(),
  smtpHost: z.preprocess(normalizeOptionalString, z.string().max(255).optional()),
  smtpPort: z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().int().min(1).max(65535).optional()),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.preprocess(normalizeOptionalString, z.string().max(255).optional()),
  smtpPass: z.preprocess(normalizeOptionalString, z.string().max(500).optional()),
  smtpFrom: z.preprocess(normalizeOptionalString, z.string().max(255).optional()),
  signupHcaptchaEnabled: z.boolean().optional(),
  hcaptchaSiteKey: z.preprocess(
    normalizeOptionalString,
    z.string().max(255, "hcaptchaSiteKeyTooLong").optional()
  ),
  hcaptchaSecret: z.preprocess(
    normalizeOptionalString,
    z.string().max(255, "hcaptchaSecretTooLong").optional()
  ),
  defaultLanguage: z.preprocess(
    normalizeOptionalString,
    z.string().max(50, "defaultLanguageTooLong").optional()
  ),
  defaultLocale: z.preprocess(
    normalizeOptionalString,
    z.enum(["en", "ko"]).optional()
  ),
  // Rate Limiting (Login)
  loginRateLimitMaxAttempts: optionalInt(1, 100),
  loginRateLimitWindowMs: optionalInt(1_000, 3_600_000),
  loginRateLimitBlockMs: optionalInt(1_000, 86_400_000),
  // Rate Limiting (API)
  apiRateLimitMax: optionalInt(1, 10_000),
  apiRateLimitWindowMs: optionalInt(1_000, 3_600_000),
  // Rate Limiting (Submissions)
  submissionRateLimitMaxPerMinute: optionalInt(1, 10_000),
  submissionMaxPending: optionalInt(1, 1_000),
  submissionGlobalQueueLimit: optionalInt(1, 100_000),
  // Judge Defaults
  defaultTimeLimitMs: optionalInt(100, 300_000),
  defaultMemoryLimitMb: optionalInt(16, 4_096),
  maxSourceCodeSizeBytes: optionalInt(1_024, 10_485_760),
  staleClaimTimeoutMs: optionalInt(10_000, 3_600_000),
  // Session & Auth
  sessionMaxAgeSeconds: optionalInt(300, 7_776_000),
  // Pagination
  defaultPageSize: optionalInt(5, 200),
  // Real-time / SSE
  maxSseConnectionsPerUser: optionalInt(1, 50),
  ssePollIntervalMs: optionalInt(500, 30_000),
  sseTimeoutMs: optionalInt(10_000, 3_600_000),
  // Compiler
  compilerTimeLimitMs: optionalInt(1_000, 600_000),
  // File Uploads
  uploadMaxImageSizeBytes: optionalInt(1_048_576, 104_857_600),
  uploadMaxFileSizeBytes: optionalInt(1_048_576, 524_288_000),
  uploadMaxImageDimension: optionalInt(512, 16_384),
  uploadMaxZipDecompressedSizeBytes: optionalInt(1_048_576, 1_073_741_824),
  // Allowed Hosts
  allowedHosts: z
    .array(
      z
        .string()
        .min(1, "allowedHostEmpty")
        .max(253, "allowedHostTooLong")
        .regex(/^[a-zA-Z0-9.*:[\]\-]+$/, "allowedHostInvalid")
    )
    .max(50, "tooManyAllowedHosts")
    .optional(),
  // Home Page Content (locale-keyed overrides)
  homePageContent: z.record(z.string(), homePageLocaleSchema).nullable().optional(),
  // Footer Content (locale-keyed overrides)
  footerContent: z.record(z.string(), footerLocaleSchema).nullable().optional(),
});

export type SystemSettingsInput = z.infer<typeof systemSettingsSchema>;
