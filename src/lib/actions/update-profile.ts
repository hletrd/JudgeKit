"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { withUpdatedAt } from "@/lib/db/helpers";
import { getDbNowUncached } from "@/lib/db-time";
import { auth, unstable_update } from "@/lib/auth";
import { buildServerActionAuditContext, recordAuditEvent } from "@/lib/audit/events";
import { isTrustedServerActionOrigin } from "@/lib/security/server-actions";
import { checkServerActionRateLimit } from "@/lib/security/api-rate-limit";
import { logger } from "@/lib/logger";
import { getRoleLevel } from "@/lib/capabilities/cache";
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

  const rateLimit = await checkServerActionRateLimit(session.user.id, "updateProfile", 20, 60);
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
      shareAcceptedSolutions: true,
      acceptedSolutionsAnonymous: true,
      editorTheme: true,
      editorFontSize: true,
      editorFontFamily: true,
    },
  });

  if (!currentUser) {
    return { success: false, error: "notAuthenticated" };
  }

  const {
    name,
    className,
    preferredLanguage,
    preferredTheme,
    shareAcceptedSolutions,
    acceptedSolutionsAnonymous,
    editorTheme,
    editorFontSize,
    editorFontFamily,
  } = parsedInput.data;
  const actorRoleLevel = await getRoleLevel(session.user.role);
  const canEditClassName = actorRoleLevel > 0;
  const requestedClassName = className ?? null;
  const normalizedClassName = canEditClassName ? requestedClassName : currentUser.className;
  const normalizedPreferredLanguage = preferredLanguage ?? null;
  const normalizedPreferredTheme = preferredTheme ?? null;
  const normalizedEditorTheme = editorTheme ?? null;
  const normalizedEditorFontSize = editorFontSize ?? null;
  const normalizedEditorFontFamily = editorFontFamily ?? null;
  const changedFields = [
    currentUser.name !== name ? "name" : null,
    canEditClassName && currentUser.className !== normalizedClassName ? "className" : null,
    currentUser.preferredLanguage !== normalizedPreferredLanguage ? "preferredLanguage" : null,
    currentUser.preferredTheme !== normalizedPreferredTheme ? "preferredTheme" : null,
    currentUser.shareAcceptedSolutions !== (shareAcceptedSolutions ?? true) ? "shareAcceptedSolutions" : null,
    currentUser.acceptedSolutionsAnonymous !== (acceptedSolutionsAnonymous ?? false) ? "acceptedSolutionsAnonymous" : null,
    currentUser.editorTheme !== normalizedEditorTheme ? "editorTheme" : null,
    currentUser.editorFontSize !== normalizedEditorFontSize ? "editorFontSize" : null,
    currentUser.editorFontFamily !== normalizedEditorFontFamily ? "editorFontFamily" : null,
  ].flatMap((value) => (value ? [value] : []));

  try {
    await db.update(users)
      .set(withUpdatedAt({
        name,
        className: normalizedClassName,
        preferredLanguage: normalizedPreferredLanguage,
        preferredTheme: normalizedPreferredTheme,
        shareAcceptedSolutions: shareAcceptedSolutions ?? true,
        acceptedSolutionsAnonymous: acceptedSolutionsAnonymous ?? false,
        editorTheme: normalizedEditorTheme,
        editorFontSize: normalizedEditorFontSize,
        editorFontFamily: normalizedEditorFontFamily,
      }, await getDbNowUncached()))
      .where(eq(users.id, session.user.id));
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
      shareAcceptedSolutions: shareAcceptedSolutions ?? true,
      acceptedSolutionsAnonymous: acceptedSolutionsAnonymous ?? false,
      editorTheme: normalizedEditorTheme,
      editorFontSize: normalizedEditorFontSize,
      editorFontFamily: normalizedEditorFontFamily,
    },
  });

  const auditContext = await buildServerActionAuditContext("/profile");
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
