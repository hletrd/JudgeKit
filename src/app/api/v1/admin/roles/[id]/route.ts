import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db, execTransaction } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { forbidden } from "@/lib/api/auth";
import { resolveCapabilities, invalidateRoleCache, isSuperAdminRole, getRoleLevel } from "@/lib/capabilities/cache";
import { recordAuditEventDurable } from "@/lib/audit/events";
import { updateRoleSchema } from "@/lib/validators/roles";
import { withUpdatedAt } from "@/lib/db/helpers";
import { getDbNowUncached } from "@/lib/db-time";
import { createApiHandler } from "@/lib/api/handler";

const ROLE_COLUMNS = {
  id: roles.id,
  name: roles.name,
  displayName: roles.displayName,
  description: roles.description,
  isBuiltin: roles.isBuiltin,
  level: roles.level,
  capabilities: roles.capabilities,
  createdAt: roles.createdAt,
  updatedAt: roles.updatedAt,
} as const;

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("users.manage_roles")) return forbidden();

    const { id } = params;
    const role = await db
      .select(ROLE_COLUMNS)
      .from(roles)
      .where(eq(roles.id, id))
      .then((rows) => rows[0] ?? null);

    if (!role) {
      return apiError("notFound", 404, "role");
    }

    // Count users with this role
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.role, role.name));

    return apiSuccess({ ...role, userCount: countRow?.count ?? 0 });
  },
});

export const PATCH = createApiHandler({
  schema: updateRoleSchema,
  handler: async (req: NextRequest, { user, body, params }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("users.manage_roles")) return forbidden();

    const { id } = params;
    const role = await db
      .select(ROLE_COLUMNS)
      .from(roles)
      .where(eq(roles.id, id))
      .then((rows) => rows[0] ?? null);

    if (!role) {
      return apiError("notFound", 404, "role");
    }

    const updates = body;

    // super_admin capabilities cannot be reduced
    if ((await isSuperAdminRole(role.name)) && updates.capabilities) {
      return apiError("cannotReduceSuperAdminCapabilities", 403);
    }

    // Built-in roles: name cannot be changed (name is not in update schema)
    // Built-in roles: level cannot be changed
    if (role.isBuiltin && updates.level !== undefined && updates.level !== role.level) {
      return apiError("cannotChangeBuiltinRoleLevel", 403);
    }

    // Cannot update a role's level above your own
    const creatorLevel = await getRoleLevel(user.role);
    if (updates.level !== undefined && updates.level > creatorLevel) {
      return apiError("cannotSetRoleLevelAboveOwnLevel", 403);
    }

    // Privilege-escalation guard: the actor may only ADD capabilities they
    // themselves hold. Capabilities already on the role are allowed to remain
    // (e.g. a lower admin renaming a role a super_admin configured), so only the
    // newly-added capabilities are checked against the actor's resolved set.
    if (updates.capabilities !== undefined) {
      const existingCaps = new Set((role.capabilities as string[] | null) ?? []);
      const added = (updates.capabilities as string[]).filter((cap) => !existingCaps.has(cap));
      const ungrantable = added.filter((cap) => !caps.has(cap));
      if (ungrantable.length > 0) {
        return apiError("cannotGrantCapabilityYouLack", 403);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (updates.displayName !== undefined) updateData.displayName = updates.displayName;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.level !== undefined) updateData.level = updates.level;
    if (updates.capabilities !== undefined) updateData.capabilities = updates.capabilities;

    if (Object.keys(updateData).length === 0) {
      return apiError("noChanges", 400);
    }

    await db
      .update(roles)
      .set(withUpdatedAt(updateData, await getDbNowUncached()))
      .where(eq(roles.id, id));

    invalidateRoleCache();

    await recordAuditEventDurable({
      actorId: user.id,
      actorRole: user.role,
      action: "update",
      resourceType: "role",
      resourceId: id,
      resourceLabel: role.name,
      summary: `Updated role "${role.displayName}"`,
      details: JSON.stringify(updates),
      request: req,
    });

    const updated = await db
      .select(ROLE_COLUMNS)
      .from(roles)
      .where(eq(roles.id, id))
      .then((rows) => rows[0]);

    return apiSuccess(updated);
  },
});

export const DELETE = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("users.manage_roles")) return forbidden();

    const { id } = params;
    const txResult = await execTransaction(async (tx) => {
      const [role] = await tx
        .select(ROLE_COLUMNS)
        .from(roles)
        .where(eq(roles.id, id))
        .limit(1)
        .for("update");

      if (!role) {
        return { error: "notFound" as const };
      }

      if (role.isBuiltin) {
        return { error: "cannotDeleteBuiltinRole" as const };
      }

      const [countRow] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.role, role.name));

      if ((countRow?.count ?? 0) > 0) {
        return { error: "roleHasUsers" as const };
      }

      await tx.delete(roles).where(eq(roles.id, id));
      return { role };
    });

    if ("error" in txResult) {
      if (txResult.error === "notFound") {
        return apiError("notFound", 404, "role");
      }
      if (txResult.error === "cannotDeleteBuiltinRole") {
        return apiError("cannotDeleteBuiltinRole", 403);
      }
      return apiError("roleHasUsers", 409);
    }

    const { role } = txResult;

    invalidateRoleCache();

    await recordAuditEventDurable({
      actorId: user.id,
      actorRole: user.role,
      action: "delete",
      resourceType: "role",
      resourceId: id,
      resourceLabel: role.name,
      summary: `Deleted custom role "${role.displayName}"`,
      request: req,
    });

    return apiSuccess({ deleted: true });
  },
});
