import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiKeys, users, roles } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { createApiHandler, isAdmin } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { generateApiKey } from "@/lib/api/api-key-auth";
import { recordAuditEvent } from "@/lib/audit/events";
import { canManageRoleAsync, isUserRole } from "@/lib/security/constants";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().min(1).max(50),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPlain: apiKeys.keyPlain,
        keyPrefix: apiKeys.keyPrefix,
        role: apiKeys.role,
        createdById: apiKeys.createdById,
        createdByName: users.name,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        isActive: apiKeys.isActive,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .leftJoin(users, eq(apiKeys.createdById, users.id))
      .orderBy(desc(apiKeys.createdAt));

    return apiSuccess(keys);
  },
});

export const POST = createApiHandler({
  rateLimit: "api-keys:create",
  schema: createSchema,
  handler: async (req: NextRequest, { user, body }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    // Validate that the requested role exists (built-in or custom)
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

    // Privilege escalation check: cannot create a key with higher privilege
    const canManage = await canManageRoleAsync(user.role, body.role);
    if (!canManage && user.role !== body.role) {
      return apiError("cannotAssignHigherRole", 403);
    }

    const { rawKey, keyPrefix } = generateApiKey();

    const [created] = await db
      .insert(apiKeys)
      .values({
        name: body.name,
        keyPlain: rawKey,
        keyPrefix,
        createdById: user.id,
        role: body.role,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      })
      .returning({ id: apiKeys.id, name: apiKeys.name, keyPrefix: apiKeys.keyPrefix });

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "api_key.created",
      resourceType: "api_key",
      resourceId: created.id,
      resourceLabel: created.name,
      summary: `Created API key "${created.name}"`,
      details: { role: body.role, keyPrefix },
      request: req,
    });

    return apiSuccess(
      { id: created.id, name: created.name, keyPrefix: created.keyPrefix, key: rawKey },
      { status: 201 },
    );
  },
});
