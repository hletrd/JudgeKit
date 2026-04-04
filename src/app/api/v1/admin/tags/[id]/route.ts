import { NextRequest } from "next/server";
import { z } from "zod";
import { createApiHandler, isAdmin, notFound } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";

const updateTagSchema = z.object({
  name: z.string().min(1).max(100).transform((s) => s.trim()).optional(),
  color: z.string().max(20).nullable().optional(),
});

export const PATCH = createApiHandler({
  schema: updateTagSchema,
  handler: async (req: NextRequest, { user, body, params }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const existing = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.id, params.id))
      .limit(1);

    if (existing.length === 0) return notFound("tag");

    const updateValues: Record<string, unknown> = {};
    if (body.name !== undefined) updateValues.name = body.name;
    if (body.color !== undefined) updateValues.color = body.color;

    if (Object.keys(updateValues).length === 0) {
      return apiSuccess(existing[0]);
    }

    await db.update(tags).set(updateValues).where(eq(tags.id, params.id));

    const updated = await db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .where(eq(tags.id, params.id))
      .then((rows) => rows[0]);

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "tag.updated",
      resourceType: "tag",
      resourceId: params.id,
      resourceLabel: updated.name,
      summary: `Updated tag "${updated.name}"`,
      details: { id: params.id, ...updateValues },
      request: req,
    });

    return apiSuccess(updated);
  },
});

export const DELETE = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const existing = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.id, params.id))
      .limit(1);

    if (existing.length === 0) return notFound("tag");

    await db.delete(tags).where(eq(tags.id, params.id));

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "tag.deleted",
      resourceType: "tag",
      resourceId: params.id,
      resourceLabel: existing[0].name,
      summary: `Deleted tag "${existing[0].name}"`,
      details: { id: params.id, name: existing[0].name },
      request: req,
    });

    return apiSuccess({ deleted: true });
  },
});
