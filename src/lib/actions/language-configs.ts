"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { buildServerActionAuditContext, recordAuditEvent } from "@/lib/audit/events";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isTrustedServerActionOrigin } from "@/lib/security/server-actions";
import { checkServerActionRateLimit } from "@/lib/security/api-rate-limit";
import { JUDGE_LANGUAGE_CONFIGS, serializeJudgeCommand } from "@/lib/judge/languages";
import { logger } from "@/lib/logger";

type LanguageConfigActionResult =
  | { success: true }
  | { success: false; error: string };

async function getAuthorizedSession() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "super_admin")) {
    return null;
  }
  return session;
}

export async function toggleLanguage(
  language: string,
  enabled: boolean
): Promise<LanguageConfigActionResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await getAuthorizedSession();
  if (!session) {
    return { success: false, error: "unauthorized" };
  }

  const rateLimit = checkServerActionRateLimit(session.user.id, "languageConfig", 30, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  try {
    await db
      .update(languageConfigs)
      .set({ isEnabled: enabled, updatedAt: new Date() })
      .where(eq(languageConfigs.language, language));

    const auditContext = await buildServerActionAuditContext("/dashboard/admin/languages");
    recordAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "language_config.toggled",
      resourceType: "language_config",
      resourceId: language,
      resourceLabel: language,
      summary: `${enabled ? "Enabled" : "Disabled"} language ${language}`,
      details: { language, enabled },
      context: auditContext,
    });

    revalidatePath("/dashboard/admin/languages");
    revalidatePath("/", "layout");

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to toggle language");
    return { success: false, error: "toggleFailed" };
  }
}

export async function updateLanguageConfig(
  language: string,
  data: { dockerImage: string; compileCommand: string; runCommand: string }
): Promise<LanguageConfigActionResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await getAuthorizedSession();
  if (!session) {
    return { success: false, error: "unauthorized" };
  }

  const rateLimit = checkServerActionRateLimit(session.user.id, "languageConfig", 30, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  try {
    await db
      .update(languageConfigs)
      .set({
        dockerImage: data.dockerImage,
        compileCommand: data.compileCommand || null,
        runCommand: data.runCommand,
        updatedAt: new Date(),
      })
      .where(eq(languageConfigs.language, language));

    const auditContext = await buildServerActionAuditContext("/dashboard/admin/languages");
    recordAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "language_config.updated",
      resourceType: "language_config",
      resourceId: language,
      resourceLabel: language,
      summary: `Updated config for language ${language}`,
      details: {
        language,
        dockerImage: data.dockerImage,
        compileCommand: data.compileCommand,
        runCommand: data.runCommand,
      },
      context: auditContext,
    });

    revalidatePath("/dashboard/admin/languages");
    revalidatePath("/", "layout");

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to update language config");
    return { success: false, error: "updateFailed" };
  }
}

export async function resetLanguageToDefaults(
  language: string
): Promise<LanguageConfigActionResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await getAuthorizedSession();
  if (!session) {
    return { success: false, error: "unauthorized" };
  }

  const rateLimit = checkServerActionRateLimit(session.user.id, "languageConfig", 30, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  const definition = JUDGE_LANGUAGE_CONFIGS[language as keyof typeof JUDGE_LANGUAGE_CONFIGS];
  if (!definition) {
    return { success: false, error: "languageNotFound" };
  }

  try {
    await db
      .update(languageConfigs)
      .set({
        dockerImage: definition.dockerImage,
        compiler: definition.compiler ?? null,
        compileCommand: serializeJudgeCommand(definition.compileCommand),
        runCommand: definition.runCommand.join(" "),
        updatedAt: new Date(),
      })
      .where(eq(languageConfigs.language, language));

    const auditContext = await buildServerActionAuditContext("/dashboard/admin/languages");
    recordAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "language_config.reset",
      resourceType: "language_config",
      resourceId: language,
      resourceLabel: language,
      summary: `Reset language ${language} to defaults`,
      details: { language },
      context: auditContext,
    });

    revalidatePath("/dashboard/admin/languages");
    revalidatePath("/", "layout");

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to reset language to defaults");
    return { success: false, error: "resetFailed" };
  }
}

export async function resetAllLanguagesToDefaults(): Promise<LanguageConfigActionResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await getAuthorizedSession();
  if (!session) {
    return { success: false, error: "unauthorized" };
  }

  const rateLimit = checkServerActionRateLimit(session.user.id, "languageConfig", 30, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  try {
    for (const [lang, definition] of Object.entries(JUDGE_LANGUAGE_CONFIGS)) {
      await db
        .update(languageConfigs)
        .set({
          dockerImage: definition.dockerImage,
          compiler: definition.compiler ?? null,
          compileCommand: serializeJudgeCommand(definition.compileCommand),
          runCommand: definition.runCommand.join(" "),
          updatedAt: new Date(),
        })
        .where(eq(languageConfigs.language, lang));
    }

    const auditContext = await buildServerActionAuditContext("/dashboard/admin/languages");
    recordAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "language_config.reset_all",
      resourceType: "language_config",
      resourceId: "all",
      resourceLabel: "All languages",
      summary: "Reset all language configs to defaults (isEnabled preserved)",
      details: { resetCount: Object.keys(JUDGE_LANGUAGE_CONFIGS).length },
      context: auditContext,
    });

    revalidatePath("/dashboard/admin/languages");
    revalidatePath("/", "layout");

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to reset all language configs to defaults");
    return { success: false, error: "resetAllFailed" };
  }
}
