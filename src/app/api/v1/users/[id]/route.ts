import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden, notFound, isAdmin, csrfForbidden } from "@/lib/api/auth";
import { recordAuditEvent } from "@/lib/audit/events";
import { hash } from "bcryptjs";
import {
  canManageRole,
  isUserRole,
} from "@/lib/security/constants";
import { safeUserSelect } from "@/lib/db/selects";
import { getPasswordValidationError } from "@/lib/security/password";
import { updateProfileSchema, adminUpdateUserSchema } from "@/lib/validators/profile";

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

    const found = await db
      .select(safeUserSelect)
      .from(users)
      .where(eq(users.id, id))
      .then((r) => r[0]);

    if (!found) return notFound("User");

    return NextResponse.json({ data: found });
  } catch (error) {
    console.error("GET /api/v1/users/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const isAdminActor = isAdmin(user.role);
    const isSelf = user.id === id;

    if (!isAdminActor && !isSelf) return forbidden();

    const found = await db
      .select(safeUserSelect)
      .from(users)
      .where(eq(users.id, id))
      .then((r) => r[0]);

    if (!found) return notFound("User");

    const body = await request.json();

    // Validate profile fields via Zod
    const profileSchema = isAdminActor ? adminUpdateUserSchema : updateProfileSchema;
    const profileFields: Record<string, unknown> = {};
    if (body.name !== undefined) profileFields.name = body.name;
    if (body.className !== undefined) profileFields.className = body.className;
    if (isAdminActor && body.email !== undefined) profileFields.email = body.email;
    if (isAdminActor && body.username !== undefined) profileFields.username = body.username;

    if (Object.keys(profileFields).length > 0) {
      const parsed = profileSchema.partial().safeParse(profileFields);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "validationError" },
          { status: 400 }
        );
      }
    }

    if (!isAdminActor && body.username !== undefined) {
      return NextResponse.json({ error: "usernameChangeNotAllowed" }, { status: 403 });
    }

    if (!isAdminActor && body.email !== undefined) {
      return NextResponse.json({ error: "emailChangeNotAllowed" }, { status: 403 });
    }

    const { name, username, email, className, role, isActive, password } = body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const normalizedEmail = typeof email === "string" && email.trim() !== "" ? email.trim() : null;
    const normalizedClassName = typeof className === "string" && className.trim() !== "" ? className.trim() : null;

    if (username !== undefined && isAdminActor) {
      const existingUsername = await db.query.users.findFirst({
        where: eq(users.username, username),
      });

      if (existingUsername && existingUsername.id !== id) {
        return NextResponse.json({ error: "usernameInUse" }, { status: 409 });
      }
    }

    if (isAdminActor && email !== undefined && normalizedEmail) {
      const existingEmail = await db.query.users.findFirst({
        where: eq(users.email, normalizedEmail),
      });

      if (existingEmail && existingEmail.id !== id) {
        return NextResponse.json({ error: "emailInUse" }, { status: 409 });
      }
    }

    if (name !== undefined) updates.name = name;
    if (username !== undefined && isAdminActor) updates.username = username;
    if (email !== undefined && isAdminActor) updates.email = normalizedEmail;
    if (className !== undefined) updates.className = normalizedClassName;
    if (isActive !== undefined && isAdminActor) {
      if (isActive === false && found.id === user.id) {
        return NextResponse.json({ error: "cannotDeactivateSelf" }, { status: 403 });
      }

      if (isActive === false && found.role === "super_admin") {
        return NextResponse.json({ error: "cannotDeactivateSuperAdmin" }, { status: 403 });
      }

      updates.isActive = isActive;

      if (isActive === false) {
        updates.tokenInvalidatedAt = new Date();
      }
    }
    if (role !== undefined) {
      if (!isAdminActor) return forbidden();

      if (typeof role !== "string" || !isUserRole(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      if (!canManageRole(user.role, role)) {
        return NextResponse.json(
          { error: "Only super_admin can assign super_admin role" },
          { status: 403 }
        );
      }

      if (found.role === "super_admin" && role !== "super_admin" && user.role !== "super_admin") {
        return NextResponse.json(
          { error: "Only super_admin can change super_admin role" },
          { status: 403 }
        );
      }

      if (found.role === "super_admin" && role !== "super_admin") {
        return NextResponse.json({ error: "Cannot change super_admin role" }, { status: 403 });
      }

      updates.role = role;

      if (role !== found.role) {
        updates.tokenInvalidatedAt = new Date();
      }
    }
    if (password !== undefined) {
      if (!isAdminActor || isSelf) {
        return NextResponse.json(
          { error: "passwordChangeRequiresCurrentPassword" },
          { status: 403 }
        );
      }

      if (typeof password !== "string") {
        return NextResponse.json({ error: "passwordTooShort" }, { status: 400 });
      }

      const passwordValidationError = getPasswordValidationError(password);

      if (passwordValidationError) {
        return NextResponse.json({ error: passwordValidationError }, { status: 400 });
      }

      updates.passwordHash = await hash(password, 12);
      updates.mustChangePassword = true;
      updates.tokenInvalidatedAt = new Date();
    }

    await db.update(users).set(updates).where(eq(users.id, id));

    const updated = await db
      .select(safeUserSelect)
      .from(users)
      .where(eq(users.id, id))
      .then((r) => r[0]);

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
          resetPassword: password !== undefined,
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
