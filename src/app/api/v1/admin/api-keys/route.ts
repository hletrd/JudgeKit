import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiKeys, users, roles } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { generateApiKey, encryptApiKey } from "@/lib/api/api-key-auth";
import { recordAuditEvent } from "@/lib/audit/events";
import { canManageRoleAsync, isUserRole } from "@/lib/security/constants";
import { getDbNowUncached } from "@/lib/db-time";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().min(1).max(50),
  expiryDays: z.number().int().min(1).max(3650).nullable().optional(),
});

export const GET = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  handler: async () => {
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        role: apiKeys.role,
        createdById: apiKeys.createdById,
        createdByName: users.name,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        // Compute isExpired server-side using DB time so the client doesn't need
        // to compare raw timestamps against the browser clock.
        isExpired: sql<boolean>`CASE WHEN ${apiKeys.expiresAt} IS NOT NULL AND ${apiKeys.expiresAt} < NOW() THEN true ELSE false END`,
        isActive: apiKeys.isActive,
        createdAt: apiKeys.createdAt,
        hasEncryptedKey: sql<boolean>`${apiKeys.encryptedKey} IS NOT NULL`,
      })
      .from(apiKeys)
      .leftJoin(users, eq(apiKeys.createdById, users.id))
      .orderBy(desc(apiKeys.createdAt));

    return apiSuccess(rows);
  },
});

export const POST = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  rateLimit: "api-keys:create",
  schema: createSchema,
  handler: async (req: NextRequest, { user, body }) => {
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

    const { rawKey, keyPrefix, keyHash } = generateApiKey();
    const encryptedKey = encryptApiKey(rawKey);

    // Compute expiresAt server-side using DB time instead of accepting a
    // client-computed timestamp. This ensures the stored expiry is
    // consistent with the NOW()-based isExpired check in the GET endpoint.
    const dbNow = await getDbNowUncached();
    const expiresAt = body.expiryDays
      ? new Date(dbNow.getTime() + body.expiryDays * 86400000)
      : null;

    const [created] = await db
      .insert(apiKeys)
      .values({
        name: body.name,
        keyHash,
        keyPrefix,
        encryptedKey,
        createdById: user.id,
        role: body.role,
        expiresAt,
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
