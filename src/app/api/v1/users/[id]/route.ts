import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db, execTransaction } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { forbidden, notFound, isAdmin, createApiHandler } from "@/lib/api/handler";
import type { AuthUser } from "@/lib/api/handler";
import { recordAuditEvent } from "@/lib/audit/events";
import {
  canManageRole,
  isUserRole,
} from "@/lib/security/constants";
import { safeUserSelect } from "@/lib/db/selects";
import { updateProfileSchema, adminUpdateUserSchema } from "@/lib/validators/profile";
import { withUpdatedAt } from "@/lib/db/helpers";
import {
  isUsernameTaken,
  isEmailTaken,
  validateAndHashPassword,
} from "@/lib/users/core";

const adminPatchUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  username: z.string().min(1).max(50).optional(),
  email: z.string().email().optional().nullable(),
  className: z.string().max(100).optional().nullable(),
  role: z.enum(["student", "instructor", "admin", "super_admin"]).optional(),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
  password: z.string().min(1).optional(),
}).strict();

type UserUpdates = Record<string, unknown>;

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function normalizeOptionalEmail(value: unknown) {
  const normalized = normalizeOptionalText(value);
  return normalized?.toLowerCase() ?? null;
}

function getProfileFields(body: Record<string, unknown>, isAdminActor: boolean) {
  const profileFields: Record<string, unknown> = {};

  if (body.name !== undefined) profileFields.name = body.name;
  if (body.className !== undefined) profileFields.className = body.className;
  if (isAdminActor && body.email !== undefined) profileFields.email = body.email;
  if (isAdminActor && body.username !== undefined) profileFields.username = body.username;

  return profileFields;
}

function validateProfileFields(body: Record<string, unknown>, isAdminActor: boolean) {
  const profileSchema = isAdminActor ? adminUpdateUserSchema : updateProfileSchema;
  const profileFields = getProfileFields(body, isAdminActor);

  if (Object.keys(profileFields).length === 0) {
    return null;
  }

  const parsed = profileSchema.partial().safeParse(profileFields);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "validationError", 400);
  }

  return null;
}

async function ensureUniqueIdentityFields(
  userId: string,
  username: unknown,
  normalizedEmail: string | null,
  isAdminActor: boolean,
  tx?: import("@/lib/db").TransactionClient
) {
  if (typeof username === "string" && isAdminActor) {
    if (await isUsernameTaken(username, userId, tx)) {
      return apiError("usernameInUse", 409);
    }
  }

  if (isAdminActor && normalizedEmail) {
    if (await isEmailTaken(normalizedEmail, userId, tx)) {
      return apiError("emailInUse", 409);
    }
  }

  return null;
}

async function findSafeUserById(userId: string) {
  return db
    .select(safeUserSelect)
    .from(users)
    .where(eq(users.id, userId))
    .then((rows) => rows[0] ?? null);
}

type ExistingUserRecord = NonNullable<Awaited<ReturnType<typeof findSafeUserById>>>;

function applyBasicFieldUpdates(
  updates: UserUpdates,
  body: Record<string, unknown>,
  isAdminActor: boolean
) {
  const normalizedEmail = normalizeOptionalEmail(body.email);
  const normalizedClassName = normalizeOptionalText(body.className);

  if (body.name !== undefined) updates.name = body.name;
  if (body.username !== undefined && isAdminActor) updates.username = body.username;
  if (body.email !== undefined && isAdminActor) updates.email = normalizedEmail;
  if (body.className !== undefined) updates.className = normalizedClassName;

  return { normalizedEmail };
}

function applyActiveStatusUpdate(
  updates: UserUpdates,
  body: Record<string, unknown>,
  found: ExistingUserRecord,
  actorId: string,
  isAdminActor: boolean
) {
  if (body.isActive === undefined || !isAdminActor) {
    return null;
  }

  if (body.isActive === false && found.id === actorId) {
    return apiError("cannotDeactivateSelf", 403);
  }

  if (body.isActive === false && found.role === "super_admin") {
    return apiError("cannotDeactivateSuperAdmin", 403);
  }

  updates.isActive = body.isActive;

  if (body.isActive === false) {
    updates.tokenInvalidatedAt = new Date();
  }

  return null;
}

function applyMustChangePasswordUpdate(
  updates: UserUpdates,
  body: Record<string, unknown>,
  isAdminActor: boolean
) {
  if (body.mustChangePassword === undefined) {
    return null;
  }

  if (!isAdminActor) {
    return forbidden();
  }

  updates.mustChangePassword = body.mustChangePassword;
  if (body.mustChangePassword === false) {
    updates.tokenInvalidatedAt = new Date();
  }

  return null;
}

function applyRoleUpdate(
  updates: UserUpdates,
  body: Record<string, unknown>,
  actor: AuthUser,
  found: ExistingUserRecord,
  isAdminActor: boolean
) {
  if (body.role === undefined) {
    return null;
  }

  if (!isAdminActor) {
    return forbidden();
  }

  if (typeof body.role !== "string" || !isUserRole(body.role)) {
    return apiError("invalidRole", 400);
  }

  if (!canManageRole(actor.role, body.role)) {
    return apiError("superAdminRoleRestricted", 403);
  }

  if (found.role === "super_admin" && body.role !== "super_admin") {
    return apiError("superAdminRoleRestricted", 403);
  }

  updates.role = body.role;

  if (body.role !== found.role) {
    updates.tokenInvalidatedAt = new Date();
  }

  return null;
}

async function applyPasswordUpdate(
  updates: UserUpdates,
  password: unknown,
  actorRole: string,
  isSelf: boolean,
  targetRole: string
) {
  if (password === undefined) {
    return null;
  }

  const isAdminActor = actorRole === "admin" || actorRole === "super_admin";

  if (!isAdminActor || isSelf) {
    return apiError("passwordChangeRequiresCurrentPassword", 403);
  }

  // Only super_admin can reset another admin's password
  if ((targetRole === "admin" || targetRole === "super_admin") && actorRole !== "super_admin") {
    return apiError("cannotResetAdminPassword", 403);
  }

  if (typeof password !== "string") {
    return apiError("passwordTooShort", 400);
  }

  const passwordResult = await validateAndHashPassword(password);

  if (passwordResult.error) {
    return apiError(passwordResult.error, 400);
  }

  updates.passwordHash = passwordResult.hash;
  updates.mustChangePassword = true;
  updates.tokenInvalidatedAt = new Date();

  return null;
}

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    const isAdminActor = isAdmin(user.role);
    const isSelf = user.id === id;

    if (!isAdminActor && !isSelf) return forbidden();

    const found = await findSafeUserById(id);

    if (!found) return notFound("User");

    return apiSuccess(found);
  },
});

export const PATCH = createApiHandler({
  rateLimit: "users:update",
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    const isAdminActor = isAdmin(user.role);
    const isSelf = user.id === id;

    if (!isAdminActor && !isSelf) return forbidden();

    const found = await findSafeUserById(id);

    if (!found) return notFound("User");

    const rawBody = await req.json();
    const parsed = adminPatchUserSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "invalidInput", 400);
    }
    const body = parsed.data;
    const profileValidationError = validateProfileFields(body, isAdminActor);
    if (profileValidationError) return profileValidationError;

    if (!isAdminActor && body.username !== undefined) {
      return apiError("usernameChangeNotAllowed", 403);
    }

    if (!isAdminActor && body.email !== undefined) {
      return apiError("emailChangeNotAllowed", 403);
    }

    const updates: Record<string, unknown> = {};
    const { normalizedEmail } = applyBasicFieldUpdates(updates, body, isAdminActor);

    const activeStatusError = applyActiveStatusUpdate(updates, body, found, user.id, isAdminActor);
    if (activeStatusError) return activeStatusError;

    const mustChangePasswordError = applyMustChangePasswordUpdate(updates, body, isAdminActor);
    if (mustChangePasswordError) return mustChangePasswordError;

    const roleUpdateError = applyRoleUpdate(updates, body, user, found, isAdminActor);
    if (roleUpdateError) return roleUpdateError;

    const passwordUpdateError = await applyPasswordUpdate(
      updates,
      body.password,
      user.role,
      isSelf,
      found.role
    );
    if (passwordUpdateError) return passwordUpdateError;

    // Wrap uniqueness check + update in a transaction to prevent TOCTOU races
    try {
      await execTransaction(async (tx) => {
        const uniqueIdentityError = await ensureUniqueIdentityFields(
          id,
          body.username,
          normalizedEmail,
          isAdminActor,
          tx
        );
        if (uniqueIdentityError) throw uniqueIdentityError;

        await tx.update(users).set(withUpdatedAt(updates)).where(eq(users.id, id));
      });
    } catch (err: unknown) {
      // Re-throw API error responses from ensureUniqueIdentityFields
      if (err && typeof err === "object" && "status" in err && "body" in err) {
        return err as ReturnType<typeof apiError>;
      }
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === "23505") {
        if (pgErr.constraint?.includes("username")) {
          return apiError("usernameInUse", 409);
        }
        if (pgErr.constraint?.includes("email")) {
          return apiError("emailInUse", 409);
        }
      }
      throw err;
    }

    const updated = await findSafeUserById(id);

    if (updated) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "user.updated_api",
        resourceType: "user",
        resourceId: updated.id,
        resourceLabel: updated.username,
        summary: `Updated user @${updated.username} via API`,
        details: {
          changedFields: Object.keys(body).filter((key) =>
            ["name", "username", "email", "className", "role", "isActive", "mustChangePassword", "password"].includes(key)
          ),
          resetPassword: body.password !== undefined,
          role: updated.role,
          isActive: updated.isActive,
          invalidatedExistingSessions: Boolean(updates.tokenInvalidatedAt),
        },
        request: req,
      });
    }

    return apiSuccess(updated);
  },
});

export const DELETE = createApiHandler({
  rateLimit: "users:delete",
  handler: async (req: NextRequest, { user, params }) => {
    if (!isAdmin(user.role)) return forbidden();

    const { id } = params;
    const permanent = req.nextUrl.searchParams.get("permanent") === "true";

    const found = await db
      .select(safeUserSelect)
      .from(users)
      .where(eq(users.id, id))
      .then((r) => r[0]);

    if (!found) return notFound("User");

    if (found.id === user.id) {
      return apiError(permanent ? "cannotDeleteSelf" : "cannotDeactivateSelf", 403);
    }

    if (found.role === "super_admin") {
      return apiError(permanent ? "cannotDeleteSuperAdmin" : "cannotDeactivateSuperAdmin", 403);
    }

    if (permanent) {
      // Require username confirmation for permanent deletion
      let body: { confirmUsername?: string } = {};
      try {
        body = await req.json();
      } catch {
        return apiError("confirmUsernameRequired", 400);
      }

      if (!body.confirmUsername || body.confirmUsername.toLowerCase() !== found.username.toLowerCase()) {
        return apiError("confirmUsernameRequired", 400);
      }

      // Record audit BEFORE deletion since actorId FK gets set-null on cascade
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "user.permanently_deleted",
        resourceType: "user",
        resourceId: found.id,
        resourceLabel: found.username,
        summary: `Permanently deleted user @${found.username}`,
        details: {
          role: found.role,
        },
        request: req,
      });

      await db.delete(users).where(eq(users.id, id));

      return apiSuccess({ id, deleted: true });
    }

    await db.update(users).set(withUpdatedAt({ isActive: false, tokenInvalidatedAt: new Date() })).where(eq(users.id, id));

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "user.access_deactivated_api",
      resourceType: "user",
      resourceId: found.id,
      resourceLabel: found.username,
      summary: `Deactivated access for @${found.username} via API`,
      details: {
        role: found.role,
      },
      request: req,
    });

    return apiSuccess({ id, isActive: false });
  },
});
