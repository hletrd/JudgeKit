import { z } from "zod";

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
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
});

export type SystemSettingsInput = z.infer<typeof systemSettingsSchema>;
