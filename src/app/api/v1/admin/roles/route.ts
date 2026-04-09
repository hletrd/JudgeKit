import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db, execTransaction } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { forbidden } from "@/lib/api/auth";
import { resolveCapabilities, invalidateRoleCache } from "@/lib/capabilities/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import { nanoid } from "nanoid";
import { createRoleSchema } from "@/lib/validators/roles";
import { isBuiltinRole } from "@/lib/capabilities/types";
import { createApiHandler } from "@/lib/api/handler";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("users.manage_roles")) return forbidden();

    const allRoles = await db
      .select({
        id: roles.id,
        name: roles.name,
        displayName: roles.displayName,
        description: roles.description,
        isBuiltin: roles.isBuiltin,
        level: roles.level,
        capabilities: roles.capabilities,
        createdAt: roles.createdAt,
        updatedAt: roles.updatedAt,
      })
      .from(roles)
      .orderBy(roles.level, roles.name);

    // Count users per role
    const userCounts = await db
      .select({
        role: users.role,
        count: sql<number>`count(*)`,
      })
      .from(users)
      .groupBy(users.role);

    const countMap = new Map(userCounts.map((r) => [r.role, r.count]));

    const result = allRoles.map((role) => ({
      ...role,
      userCount: countMap.get(role.name) ?? 0,
    }));

    return apiSuccess(result);
  },
});

export const POST = createApiHandler({
  schema: createRoleSchema,
  handler: async (req: NextRequest, { user, body }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("users.manage_roles")) return forbidden();

    const { name, displayName, description, level, capabilities } = body;

    // Cannot use built-in role names
    if (isBuiltinRole(name)) {
      return apiError("roleNameReserved", 400);
    }

    const id = nanoid();
    const now = new Date();

    // Atomic uniqueness check + insert to prevent TOCTOU race
    try {
      await execTransaction(async (tx) => {
        const [existing] = await tx
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.name, name))
          .limit(1);

        if (existing) {
          throw new Error("roleNameExists");
        }

        await tx.insert(roles).values({
          id,
          name,
          displayName,
          description: description ?? null,
          isBuiltin: false,
          level,
          capabilities: capabilities as string[],
          createdAt: now,
          updatedAt: now,
        });
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "roleNameExists") {
        return apiError("roleNameExists", 409);
      }
      throw err;
    }

    invalidateRoleCache();

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "create",
      resourceType: "role",
      resourceId: id,
      resourceLabel: name,
      summary: `Created custom role "${displayName}"`,
      request: req,
    });

    const created = await db
      .select()
      .from(roles)
      .where(eq(roles.id, id))
      .then((rows) => rows[0]);

    return apiSuccess(created, { status: 201 });
  },
});
