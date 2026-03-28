"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { withUpdatedAt } from "@/lib/db/helpers";
import { auth, unstable_update } from "@/lib/auth";
import { buildServerActionAuditContext, recordAuditEvent } from "@/lib/audit/events";
import { isTrustedServerActionOrigin } from "@/lib/security/server-actions";
import { checkServerActionRateLimit } from "@/lib/security/api-rate-limit";
import { logger } from "@/lib/logger";
import {
  type UpdateProfileInput,
  updateProfileSchema,
} from "@/lib/validators/profile";

export async function updateProfile(
  input: UpdateProfileInput
): Promise<{ success: boolean; error?: string }> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "notAuthenticated" };
  }

  const rateLimit = checkServerActionRateLimit(session.user.id, "updateProfile", 20, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  const parsedInput = updateProfileSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      success: false,
      error: parsedInput.error.issues[0]?.message ?? "updateError",
    };
  }

  const currentUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      id: true,
      username: true,
      name: true,
      className: true,
      preferredLanguage: true,
      preferredTheme: true,
      editorTheme: true,
      editorFontSize: true,
      editorFontFamily: true,
    },
  });

  if (!currentUser) {
    return { success: false, error: "notAuthenticated" };
  }

  const { name, className, preferredLanguage, preferredTheme, editorTheme, editorFontSize, editorFontFamily } = parsedInput.data;
  const normalizedClassName = className ?? null;
  const normalizedPreferredLanguage = preferredLanguage ?? null;
  const normalizedPreferredTheme = preferredTheme ?? null;
  const normalizedEditorTheme = editorTheme ?? null;
  const normalizedEditorFontSize = editorFontSize ?? null;
  const normalizedEditorFontFamily = editorFontFamily ?? null;
  const changedFields = [
    currentUser.name !== name ? "name" : null,
    currentUser.className !== normalizedClassName ? "className" : null,
    currentUser.preferredLanguage !== normalizedPreferredLanguage ? "preferredLanguage" : null,
    currentUser.preferredTheme !== normalizedPreferredTheme ? "preferredTheme" : null,
    currentUser.editorTheme !== normalizedEditorTheme ? "editorTheme" : null,
    currentUser.editorFontSize !== normalizedEditorFontSize ? "editorFontSize" : null,
    currentUser.editorFontFamily !== normalizedEditorFontFamily ? "editorFontFamily" : null,
  ].flatMap((value) => (value ? [value] : []));

  try {
    db.update(users)
      .set(withUpdatedAt({
        name,
        className: normalizedClassName,
        preferredLanguage: normalizedPreferredLanguage,
        preferredTheme: normalizedPreferredTheme,
        editorTheme: normalizedEditorTheme,
        editorFontSize: normalizedEditorFontSize,
        editorFontFamily: normalizedEditorFontFamily,
      }))
      .where(eq(users.id, session.user.id))
      .run();
  } catch (error) {
    logger.error({ err: error }, "Failed to update profile");
    return { success: false, error: "updateError" };
  }

  await unstable_update({
    user: {
      name,
      className: normalizedClassName,
      preferredLanguage: normalizedPreferredLanguage,
      preferredTheme: normalizedPreferredTheme,
      editorTheme: normalizedEditorTheme,
      editorFontSize: normalizedEditorFontSize,
      editorFontFamily: normalizedEditorFontFamily,
    },
  });

  const auditContext = await buildServerActionAuditContext("/dashboard/profile");
  recordAuditEvent({
    actorId: currentUser.id,
    actorRole: session.user.role,
    action: "user.profile_updated",
    resourceType: "user",
    resourceId: currentUser.id,
    resourceLabel: currentUser.username,
    summary: `Updated profile for @${currentUser.username}`,
    details: {
      changedFields,
      classNameSet: normalizedClassName !== null,
    },
    context: auditContext,
  });

  return { success: true };
}
