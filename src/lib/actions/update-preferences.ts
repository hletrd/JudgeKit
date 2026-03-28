"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { withUpdatedAt } from "@/lib/db/helpers";
import { auth, unstable_update } from "@/lib/auth";
import { isTrustedServerActionOrigin } from "@/lib/security/server-actions";
import { checkServerActionRateLimit } from "@/lib/security/api-rate-limit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { normalizeOptionalString } from "@/lib/validators/preprocess";

const updatePreferencesSchema = z.object({
  preferredLanguage: z.preprocess(
    normalizeOptionalString,
    z.string().max(50).optional()
  ),
  preferredTheme: z.preprocess(
    normalizeOptionalString,
    z.enum(["light", "dark", "system"]).optional()
  ),
  editorTheme: z.preprocess(
    normalizeOptionalString,
    z.string().max(50).optional()
  ),
  editorFontSize: z.preprocess(
    normalizeOptionalString,
    z.string().max(5).optional()
  ),
  editorFontFamily: z.preprocess(
    normalizeOptionalString,
    z.string().max(100).optional()
  ),
  lectureMode: z.preprocess(
    normalizeOptionalString,
    z.enum(["on"]).nullable().optional()
  ),
  lectureFontScale: z.preprocess(
    normalizeOptionalString,
    z.enum(["1.25", "1.5", "1.75", "2.0"]).optional()
  ),
  lectureColorScheme: z.preprocess(
    normalizeOptionalString,
    z.enum(["dark", "light", "solarized"]).optional()
  ),
});

type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export async function updatePreferences(
  input: UpdatePreferencesInput
): Promise<{ success: boolean; error?: string }> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "notAuthenticated" };
  }

  const rateLimit = checkServerActionRateLimit(session.user.id, "updatePreferences", 30, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  const parsed = updatePreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "invalidInput" };
  }

  const updates: Record<string, string | null> = {};
  if (parsed.data.preferredLanguage !== undefined) {
    updates.preferredLanguage = parsed.data.preferredLanguage ?? null;
  }
  if (parsed.data.preferredTheme !== undefined) {
    updates.preferredTheme = parsed.data.preferredTheme ?? null;
  }
  if (parsed.data.editorTheme !== undefined) {
    updates.editorTheme = parsed.data.editorTheme ?? null;
  }
  if (parsed.data.editorFontSize !== undefined) {
    updates.editorFontSize = parsed.data.editorFontSize ?? null;
  }
  if (parsed.data.editorFontFamily !== undefined) {
    updates.editorFontFamily = parsed.data.editorFontFamily ?? null;
  }
  if (parsed.data.lectureMode !== undefined) {
    updates.lectureMode = parsed.data.lectureMode ?? null;
  }
  if (parsed.data.lectureFontScale !== undefined) {
    updates.lectureFontScale = parsed.data.lectureFontScale ?? null;
  }
  if (parsed.data.lectureColorScheme !== undefined) {
    updates.lectureColorScheme = parsed.data.lectureColorScheme ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return { success: true };
  }

  try {
    db.update(users)
      .set(withUpdatedAt(updates))
      .where(eq(users.id, session.user.id))
      .run();
  } catch (error) {
    logger.error({ err: error }, "Failed to update preferences");
    return { success: false, error: "updateError" };
  }

  await unstable_update({
    user: updates,
  });

  return { success: true };
}
