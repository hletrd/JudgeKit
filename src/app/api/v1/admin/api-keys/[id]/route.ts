import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiKeys, roles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createApiHandler, isAdmin } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { recordAuditEvent } from "@/lib/audit/events";
import { canManageRoleAsync, isUserRole } from "@/lib/security/constants";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.string().min(1).max(50).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const PATCH = createApiHandler({
  schema: updateSchema,
  handler: async (req: NextRequest, { user, params, body }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const { id } = params;
    const existing = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, id) });
    if (!existing) return apiError("notFound", 404, "ApiKey");

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.expiresAt !== undefined) updates.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    if (body.role !== undefined) {
      // Validate role exists
      if (!isUserRole(body.role)) {
        const customRole = await db
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.name, body.role))
          .limit(1);
        if (customRole.length === 0) {
          return apiError("invalidRole", 400);
        }
      }
      // Privilege escalation check
      const canManage = await canManageRoleAsync(user.role, body.role);
      if (!canManage && user.role !== body.role) {
        return apiError("cannotAssignHigherRole", 403);
      }
      updates.role = body.role;
    }

    await db.update(apiKeys).set(updates).where(eq(apiKeys.id, id)).run();

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "api_key.updated",
      resourceType: "api_key",
      resourceId: id,
      resourceLabel: existing.name,
      summary: `Updated API key "${existing.name}"`,
      details: body,
      request: req,
    });

    return apiSuccess({ id });
  },
});

export const DELETE = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const { id } = params;
    const existing = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, id) });
    if (!existing) return apiError("notFound", 404, "ApiKey");

    await db.delete(apiKeys).where(eq(apiKeys.id, id)).run();

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "api_key.deleted",
      resourceType: "api_key",
      resourceId: id,
      resourceLabel: existing.name,
      summary: `Deleted API key "${existing.name}"`,
      request: req,
    });

    return apiSuccess({ id });
  },
});
