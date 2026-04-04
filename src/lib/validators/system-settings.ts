import { z } from "zod";
import { normalizeOptionalString } from "@/lib/validators/preprocess";

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

export const systemSettingsSchema = z.object({
  siteTitle: z.preprocess(
    normalizeOptionalString,
    z.string().max(100, "siteTitleTooLong").optional()
  ),
  siteDescription: z.preprocess(
    normalizeOptionalString,
    z.string().max(255, "siteDescriptionTooLong").optional()
  ),
  timeZone: z.preprocess(
    normalizeOptionalString,
    z
      .string()
      .max(100, "invalidTimeZone")
      .refine(isValidTimeZone, "invalidTimeZone")
      .optional()
  ),
  aiAssistantEnabled: z.boolean().optional(),
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
  minPasswordLength: optionalInt(4, 128),
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
});

export type SystemSettingsInput = z.infer<typeof systemSettingsSchema>;
