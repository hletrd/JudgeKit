"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { buildServerActionAuditContext, recordAuditEvent } from "@/lib/audit/events";
import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isTrustedServerActionOrigin } from "@/lib/security/server-actions";
import { checkServerActionRateLimit } from "@/lib/security/api-rate-limit";
import { logger } from "@/lib/logger";
import { resolveCapabilities } from "@/lib/capabilities/cache";

type TagActionResult = { success: true } | { success: false; error: string };

async function getAuthorizedSession() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }
  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("system.settings")) {
    return null;
  }
  return session;
}

export async function createTag(name: string, color: string | null): Promise<TagActionResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await getAuthorizedSession();
  if (!session) {
    return { success: false, error: "unauthorized" };
  }

  const rateLimit = await checkServerActionRateLimit(session.user.id, "tagManagement", 30, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  const trimmedName = name.trim();
  if (!trimmedName) {
    return { success: false, error: "missingName" };
  }

  try {
    await db.insert(tags).values({
      name: trimmedName,
      color: color || null,
      createdBy: session.user.id,
    });

    const auditContext = await buildServerActionAuditContext("/dashboard/admin/tags");
    recordAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "tag.created",
      resourceType: "tag",
      resourceId: trimmedName,
      resourceLabel: trimmedName,
      summary: `Created tag "${trimmedName}"`,
      details: { name: trimmedName, color },
      context: auditContext,
    });

    revalidatePath("/dashboard/admin/tags");
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to create tag");
    return { success: false, error: "createFailed" };
  }
}

export async function updateTag(id: string, name: string, color: string | null): Promise<TagActionResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await getAuthorizedSession();
  if (!session) {
    return { success: false, error: "unauthorized" };
  }

  const rateLimit = await checkServerActionRateLimit(session.user.id, "tagManagement", 30, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  const trimmedName = name.trim();
  if (!trimmedName) {
    return { success: false, error: "missingName" };
  }

  try {
    await db
      .update(tags)
      .set({ name: trimmedName, color: color || null })
      .where(eq(tags.id, id));

    const auditContext = await buildServerActionAuditContext("/dashboard/admin/tags");
    recordAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "tag.updated",
      resourceType: "tag",
      resourceId: id,
      resourceLabel: trimmedName,
      summary: `Updated tag "${trimmedName}"`,
      details: { id, name: trimmedName, color },
      context: auditContext,
    });

    revalidatePath("/dashboard/admin/tags");
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to update tag");
    return { success: false, error: "updateFailed" };
  }
}

export async function deleteTag(id: string): Promise<TagActionResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await getAuthorizedSession();
  if (!session) {
    return { success: false, error: "unauthorized" };
  }

  const rateLimit = await checkServerActionRateLimit(session.user.id, "tagManagement", 30, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  try {
    const existing = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.id, id))
      .limit(1);

    if (existing.length === 0) {
      return { success: false, error: "notFound" };
    }

    await db.delete(tags).where(eq(tags.id, id));

    const auditContext = await buildServerActionAuditContext("/dashboard/admin/tags");
    recordAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "tag.deleted",
      resourceType: "tag",
      resourceId: id,
      resourceLabel: existing[0].name,
      summary: `Deleted tag "${existing[0].name}"`,
      details: { id, name: existing[0].name },
      context: auditContext,
    });

    revalidatePath("/dashboard/admin/tags");
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to delete tag");
    return { success: false, error: "deleteFailed" };
  }
}
