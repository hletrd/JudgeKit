import { z } from "zod";

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
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
});

export type SystemSettingsInput = z.infer<typeof systemSettingsSchema>;
