import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden, notFound, isAdmin, csrfForbidden } from "@/lib/api/auth";
import { recordAuditEvent } from "@/lib/audit/events";
import {
  canManageRole,
  isUserRole,
} from "@/lib/security/constants";
import { safeUserSelect } from "@/lib/db/selects";
import { updateProfileSchema, adminUpdateUserSchema } from "@/lib/validators/profile";
import { checkApiRateLimit, recordApiRateHit } from "@/lib/security/api-rate-limit";
import {
  isUsernameTaken,
  isEmailTaken,
  validateAndHashPassword,
} from "@/lib/users/core";

type ApiUser = NonNullable<Awaited<ReturnType<typeof getApiUser>>>;
type UserUpdates = Record<string, unknown>;

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
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
    return jsonError(parsed.error.issues[0]?.message ?? "validationError", 400);
  }

  return null;
}

async function ensureUniqueIdentityFields(
  userId: string,
  username: unknown,
  normalizedEmail: string | null,
  isAdminActor: boolean
) {
  if (typeof username === "string" && isAdminActor) {
    if (await isUsernameTaken(username, userId)) {
      return jsonError("usernameInUse", 409);
    }
  }

  if (isAdminActor && normalizedEmail) {
    if (await isEmailTaken(normalizedEmail, userId)) {
      return jsonError("emailInUse", 409);
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
  const normalizedEmail = normalizeOptionalText(body.email);
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
    return jsonError("cannotDeactivateSelf", 403);
  }

  if (body.isActive === false && found.role === "super_admin") {
    return jsonError("cannotDeactivateSuperAdmin", 403);
  }

  updates.isActive = body.isActive;

  if (body.isActive === false) {
    updates.tokenInvalidatedAt = new Date();
  }

  return null;
}

function applyRoleUpdate(
  updates: UserUpdates,
  body: Record<string, unknown>,
  actor: ApiUser,
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
    return jsonError("invalidRole", 400);
  }

  if (!canManageRole(actor.role, body.role)) {
    return jsonError("superAdminRoleRestricted", 403);
  }

  if (found.role === "super_admin" && body.role !== "super_admin") {
    return jsonError("superAdminRoleRestricted", 403);
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
  isAdminActor: boolean,
  isSelf: boolean
) {
  if (password === undefined) {
    return null;
  }

  if (!isAdminActor || isSelf) {
    return jsonError("passwordChangeRequiresCurrentPassword", 403);
  }

  if (typeof password !== "string") {
    return jsonError("passwordTooShort", 400);
  }

  const passwordResult = await validateAndHashPassword(password);

  if (passwordResult.error) {
    return jsonError(passwordResult.error, 400);
  }

  updates.passwordHash = passwordResult.hash;
  updates.mustChangePassword = true;
  updates.tokenInvalidatedAt = new Date();

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const isAdminActor = isAdmin(user.role);
    const isSelf = user.id === id;

    if (!isAdminActor && !isSelf) return forbidden();

    const found = await findSafeUserById(id);

    if (!found) return notFound("User");

    return NextResponse.json({ data: found });
  } catch (error) {
    console.error("GET /api/v1/users/[id] error:", error);
    return NextResponse.json({ error: "internalServerError" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const rateLimitResponse = checkApiRateLimit(request, "users:update");
    if (rateLimitResponse) return rateLimitResponse;
    recordApiRateHit(request, "users:update");

    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const isAdminActor = isAdmin(user.role);
    const isSelf = user.id === id;

    if (!isAdminActor && !isSelf) return forbidden();

    const found = await findSafeUserById(id);

    if (!found) return notFound("User");

    const body = (await request.json()) as Record<string, unknown>;
    const profileValidationError = validateProfileFields(body, isAdminActor);
    if (profileValidationError) return profileValidationError;

    if (!isAdminActor && body.username !== undefined) {
      return jsonError("usernameChangeNotAllowed", 403);
    }

    if (!isAdminActor && body.email !== undefined) {
      return jsonError("emailChangeNotAllowed", 403);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const { normalizedEmail } = applyBasicFieldUpdates(updates, body, isAdminActor);

    const uniqueIdentityError = await ensureUniqueIdentityFields(
      id,
      body.username,
      normalizedEmail,
      isAdminActor
    );
    if (uniqueIdentityError) return uniqueIdentityError;

    const activeStatusError = applyActiveStatusUpdate(updates, body, found, user.id, isAdminActor);
    if (activeStatusError) return activeStatusError;

    const roleUpdateError = applyRoleUpdate(updates, body, user, found, isAdminActor);
    if (roleUpdateError) return roleUpdateError;

    const passwordUpdateError = await applyPasswordUpdate(
      updates,
      body.password,
      isAdminActor,
      isSelf
    );
    if (passwordUpdateError) return passwordUpdateError;

    await db.update(users).set(updates).where(eq(users.id, id));

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
            ["name", "username", "email", "className", "role", "isActive", "password"].includes(key)
          ),
          resetPassword: body.password !== undefined,
          role: updated.role,
          isActive: updated.isActive,
          invalidatedExistingSessions: Boolean(updates.tokenInvalidatedAt),
        },
        request,
      });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/v1/users/[id] error:", error);
    return NextResponse.json({ error: "internalServerError" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();
    if (!isAdmin(user.role)) return forbidden();

    const { id } = await params;

    const found = await db
      .select(safeUserSelect)
      .from(users)
      .where(eq(users.id, id))
      .then((r) => r[0]);

    if (!found) return notFound("User");

    if (found.id === user.id) {
      return NextResponse.json({ error: "cannotDeactivateSelf" }, { status: 403 });
    }

    if (found.role === "super_admin") {
      return NextResponse.json({ error: "cannotDeactivateSuperAdmin" }, { status: 403 });
    }

    await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, id));

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
      request,
    });

    return NextResponse.json({ data: { id, isActive: false } });
  } catch (error) {
    console.error("DELETE /api/v1/users/[id] error:", error);
    return NextResponse.json({ error: "internalServerError" }, { status: 500 });
  }
}
