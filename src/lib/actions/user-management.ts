"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, groups } from "@/lib/db/schema";
import { withUpdatedAt } from "@/lib/db/helpers";
import { auth } from "@/lib/auth";
import { hashPassword } from "@/lib/security/password-hash";
import { nanoid } from "nanoid";
import { buildServerActionAuditContext, recordAuditEvent } from "@/lib/audit/events";
import { generateSecurePassword } from "@/lib/auth/generated-password";
import type { UserRole } from "@/types";
import {
  isUsernameTaken,
  isEmailTaken,
  validateAndHashPassword,
  validateRoleChange,
} from "@/lib/users/core";
import { isUserRole, ROLE_LEVEL } from "@/lib/security/constants";
import { isInstructorOrAbove } from "@/lib/auth/role-helpers";
import { adminUpdateUserSchema, userCreateSchema } from "@/lib/validators/profile";
import { isTrustedServerActionOrigin } from "@/lib/security/server-actions";
import { checkServerActionRateLimit } from "@/lib/security/api-rate-limit";
import { logger } from "@/lib/logger";

type UserUpdates = Partial<typeof users.$inferInsert>;

type UserManagementErrorKey =
  | "unauthorized"
  | "rateLimited"
  | "cannotDeactivateSelf"
  | "userNotFound"
  | "cannotDeactivateSuperAdmin"
  | "updateUserStatusFailed"
  | "usernameAndNameRequired"
  | "usernameInUse"
  | "emailInUse"
  | "onlySuperAdminCanChangeSuperAdminRole"
  | "cannotChangeSuperAdminRole"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordTooSimilar"
  | "updateUserFailed"
  | "createUserFailed"
  | "cannotDeleteSelf"
  | "cannotDeleteSuperAdmin"
  | "deleteUserFailed"
  | "confirmUsernameMismatch"
  | "instructorOwnsGroups";

type UserManagementResult =
  | { success: true }
  | { success: false; error: UserManagementErrorKey };

type ManagedUserInput = {
  username: string;
  email?: string;
  name: string;
  className?: string;
  role: string;
  password?: string;
};

export async function toggleUserActive(userId: string, isActive: boolean): Promise<UserManagementResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await auth();
  if (!session?.user || !isInstructorOrAbove(session.user.role)) {
    return { success: false, error: "unauthorized" };
  }

  const rateLimit = await checkServerActionRateLimit(session.user.id, "toggleUserActive", 20, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  // Prevent deactivating yourself
  if (userId === session.user.id) {
    return { success: false, error: "cannotDeactivateSelf" };
  }

  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, username: true, role: true },
  });

  if (!targetUser) return { success: false, error: "userNotFound" };

  // Instructors can only toggle students
  if (session.user.role === "instructor" && targetUser.role !== "student") {
    return { success: false, error: "unauthorized" };
  }

  if (targetUser.role === "super_admin" && !isActive) {
    return { success: false, error: "cannotDeactivateSuperAdmin" };
  }

  try {
    const updates: UserUpdates = { isActive };

    if (!isActive) {
      updates.tokenInvalidatedAt = new Date();
    }

    await db.update(users)
      .set(withUpdatedAt(updates))
      .where(eq(users.id, userId));

    const auditContext = await buildServerActionAuditContext("/dashboard/admin/users");
    recordAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: isActive ? "user.access_restored" : "user.access_deactivated",
      resourceType: "user",
      resourceId: targetUser.id,
      resourceLabel: targetUser.username,
      summary: `${isActive ? "Restored" : "Deactivated"} access for @${targetUser.username}`,
      details: {
        isActive,
        invalidatedExistingSessions: !isActive,
        role: targetUser.role,
      },
      context: auditContext,
    });

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to update user status");
    return { success: false, error: "updateUserStatusFailed" };
  }
}

export async function deleteUserPermanently(userId: string, confirmUsername: string): Promise<UserManagementResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "super_admin")) {
    return { success: false, error: "unauthorized" };
  }

  const rateLimit = await checkServerActionRateLimit(session.user.id, "deleteUserPermanently", 5, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  if (userId === session.user.id) {
    return { success: false, error: "cannotDeleteSelf" };
  }

  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, username: true, role: true },
  });

  if (!targetUser) return { success: false, error: "userNotFound" };

  if (targetUser.username.toLowerCase() !== confirmUsername.toLowerCase()) {
    return { success: false, error: "confirmUsernameMismatch" };
  }

  if (targetUser.role === "super_admin") {
    return { success: false, error: "cannotDeleteSuperAdmin" };
  }

  // Block deletion if user owns groups — must reassign or delete groups first
  const ownedGroups = await db.query.groups.findMany({
    where: eq(groups.instructorId, userId),
    columns: { id: true, name: true },
  });
  if (ownedGroups.length > 0) {
    return { success: false, error: "instructorOwnsGroups" };
  }

  try {
    // Record audit BEFORE deletion since actorId FK gets set-null on cascade
    const auditContext = await buildServerActionAuditContext("/dashboard/admin/users");
    recordAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "user.permanently_deleted",
      resourceType: "user",
      resourceId: targetUser.id,
      resourceLabel: targetUser.username,
      summary: `Permanently deleted user @${targetUser.username}`,
      details: {
        role: targetUser.role,
      },
      context: auditContext,
    });

    await db.delete(users).where(eq(users.id, userId));

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to permanently delete user");
    return { success: false, error: "deleteUserFailed" };
  }
}

export async function editUser(userId: string, data: ManagedUserInput): Promise<UserManagementResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await auth();
  if (!session?.user || !isInstructorOrAbove(session.user.role)) {
    return { success: false, error: "unauthorized" };
  }

  const rateLimit = await checkServerActionRateLimit(session.user.id, "editUser", 20, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  const editParsed = adminUpdateUserSchema.safeParse(data);
  if (!editParsed.success) {
    return { success: false, error: "updateUserFailed" };
  }

  if (!data.username?.trim()) {
    return { success: false, error: "usernameAndNameRequired" };
  }

  try {
    if (!isUserRole(session.user.role)) {
      return { success: false, error: "unauthorized" };
    }
    const actorRole = session.user.role;
    const normalizedEmail = data.email?.trim().toLowerCase() || null;
    const normalizedClassName = data.className?.trim() || null;
    const requestedRole = data.role.trim();

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, username: true, role: true },
    });

    if (!targetUser) return { success: false, error: "userNotFound" };

    // Instructors can only edit students
    if (session.user.role === "instructor" && targetUser.role !== "student") {
      return { success: false, error: "unauthorized" };
    }

    const roleError = validateRoleChange(actorRole, requestedRole, targetUser.role);
    if (roleError === "invalidRole") return { success: false, error: "updateUserFailed" };
    if (roleError) return { success: false, error: roleError };
    if (!isUserRole(requestedRole)) return { success: false, error: "updateUserFailed" };
    const validatedRole = requestedRole;

    if (await isUsernameTaken(data.username, userId)) {
      return { success: false, error: "usernameInUse" };
    }

    if (normalizedEmail && await isEmailTaken(normalizedEmail, userId)) {
      return { success: false, error: "emailInUse" };
    }

    // Prevent password reset for users of equal or higher privilege
    if (data.password && targetUser.role) {
      const actorLevel = ROLE_LEVEL[actorRole as UserRole] ?? 0;
      const targetLevel = ROLE_LEVEL[targetUser.role as UserRole] ?? 0;
      if (targetLevel >= actorLevel) {
        return { success: false, error: "unauthorized" };
      }
    }

    let passwordHash: string | undefined;
    if (data.password) {
      const passwordResult = await validateAndHashPassword(data.password, {
        username: data.username,
        email: normalizedEmail,
      });
      if (passwordResult.error) {
        return { success: false, error: passwordResult.error };
      }
      passwordHash = passwordResult.hash;
    }

    const updates: UserUpdates = {
      username: data.username,
      email: normalizedEmail,
      name: data.name,
      className: normalizedClassName,
      role: validatedRole,
    };

    const shouldInvalidateExistingSessions =
      validatedRole !== targetUser.role || Boolean(data.password);

    if (passwordHash) {
      updates.passwordHash = passwordHash;
      updates.mustChangePassword = true;
    }

    if (shouldInvalidateExistingSessions) {
      updates.tokenInvalidatedAt = new Date();
    }

    await db.update(users).set(withUpdatedAt(updates)).where(eq(users.id, userId));

    const auditContext = await buildServerActionAuditContext("/dashboard/admin/users");
    recordAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "user.updated",
      resourceType: "user",
      resourceId: targetUser.id,
      resourceLabel: data.username,
      summary: `Updated user @${data.username}`,
      details: {
        changedFields: Object.keys(updates).filter((key) => key !== "passwordHash"),
        invalidatedExistingSessions: shouldInvalidateExistingSessions,
        resetPassword: Boolean(data.password),
        role: validatedRole,
      },
      context: auditContext,
    });

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to update user");
    return { success: false, error: "updateUserFailed" };
  }
}

export async function createUser(data: ManagedUserInput): Promise<UserManagementResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await auth();
  if (!session?.user || !isInstructorOrAbove(session.user.role)) {
    return { success: false, error: "unauthorized" };
  }

  const rateLimit = await checkServerActionRateLimit(session.user.id, "createUser", 20, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  const createParsed = userCreateSchema.safeParse(data);
  if (!createParsed.success) {
    return { success: false, error: "createUserFailed" };
  }

  try {
    if (!isUserRole(session.user.role)) {
      return { success: false, error: "unauthorized" };
    }
    const actorRole = session.user.role;
    const normalizedEmail = data.email?.trim().toLowerCase() || null;
    const normalizedClassName = data.className?.trim() || null;
    const requestedRole = data.role.trim();

    // Instructors can only create students
    if (session.user.role === "instructor" && requestedRole !== "student") {
      return { success: false, error: "unauthorized" };
    }

    const roleError = validateRoleChange(actorRole, requestedRole);
    if (roleError === "invalidRole") return { success: false, error: "createUserFailed" };
    if (roleError) return { success: false, error: roleError };
    if (!isUserRole(requestedRole)) return { success: false, error: "createUserFailed" };
    const validatedRole = requestedRole;

    if (await isUsernameTaken(data.username)) {
      return { success: false, error: "usernameInUse" };
    }

    if (normalizedEmail && await isEmailTaken(normalizedEmail)) {
      return { success: false, error: "emailInUse" };
    }

    const id = nanoid();
    let passwordHash: string;
    if (data.password) {
      const result = await validateAndHashPassword(data.password, {
        username: data.username,
        email: normalizedEmail,
      });
      if (result.error) return { success: false, error: result.error };
      passwordHash = result.hash!;
    } else {
      passwordHash = await hashPassword(generateSecurePassword());
    }

    await db.insert(users).values({
      id,
      username: data.username,
      email: normalizedEmail,
      name: data.name,
      className: normalizedClassName,
      role: validatedRole,
      passwordHash,
      isActive: true,
      mustChangePassword: true, // force new user to change password on first login
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const auditContext = await buildServerActionAuditContext("/dashboard/admin/users");
    recordAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "user.created",
      resourceType: "user",
      resourceId: id,
      resourceLabel: data.username,
      summary: `Created user @${data.username}`,
      details: {
        role: validatedRole,
        usedGeneratedPassword: !data.password,
      },
      context: auditContext,
    });

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to create user");
    return { success: false, error: "createUserFailed" };
  }
}
