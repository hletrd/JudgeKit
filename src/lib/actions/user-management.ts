"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { hash } from "bcryptjs";
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
import { isTrustedServerActionOrigin } from "@/lib/security/server-actions";

type UserUpdates = Partial<typeof users.$inferInsert>;

type UserManagementErrorKey =
  | "unauthorized"
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
  | "passwordTooWeak"
  | "updateUserFailed"
  | "createUserFailed";

type UserManagementResult =
  | { success: true; generatedPassword?: string }
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
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "super_admin")) {
    return { success: false, error: "unauthorized" };
  }

  // Prevent deactivating yourself
  if (userId === session.user.id) {
    return { success: false, error: "cannotDeactivateSelf" };
  }

  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, username: true, role: true },
  });

  if (!targetUser) return { success: false, error: "userNotFound" };

  if (targetUser.role === "super_admin" && !isActive) {
    return { success: false, error: "cannotDeactivateSuperAdmin" };
  }

  try {
    const updates: UserUpdates = {
      isActive,
      updatedAt: new Date(),
    };

    if (!isActive) {
      updates.tokenInvalidatedAt = new Date();
    }

    await db.update(users)
      .set(updates)
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
    console.error("Failed to update user status:", error);
    return { success: false, error: "updateUserStatusFailed" };
  }
}

export async function deleteUserPermanently(userId: string): Promise<UserManagementResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "super_admin")) {
    return { success: false, error: "unauthorized" };
  }

  if (userId === session.user.id) {
    return { success: false, error: "cannotDeactivateSelf" };
  }

  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, username: true, role: true },
  });

  if (!targetUser) return { success: false, error: "userNotFound" };

  if (targetUser.role === "super_admin") {
    return { success: false, error: "cannotDeactivateSuperAdmin" };
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
    console.error("Failed to permanently delete user:", error);
    return { success: false, error: "updateUserStatusFailed" };
  }
}

export async function editUser(userId: string, data: ManagedUserInput): Promise<UserManagementResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "super_admin")) {
    return { success: false, error: "unauthorized" };
  }

  if (!data.username || !data.name) {
    return { success: false, error: "usernameAndNameRequired" };
  }

  try {
    const actorRole = session.user.role as UserRole;
    const normalizedEmail = data.email?.trim() || null;
    const normalizedClassName = data.className?.trim() || null;
    const requestedRole = data.role.trim();

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, username: true, role: true },
    });

    if (!targetUser) return { success: false, error: "userNotFound" };

    const roleError = validateRoleChange(actorRole, requestedRole, targetUser.role);
    if (roleError === "invalidRole") return { success: false, error: "updateUserFailed" };
    if (roleError) return { success: false, error: roleError };
    const validatedRole = requestedRole as UserRole;

    if (await isUsernameTaken(data.username, userId)) {
      return { success: false, error: "usernameInUse" };
    }

    if (normalizedEmail && await isEmailTaken(normalizedEmail, userId)) {
      return { success: false, error: "emailInUse" };
    }

    let passwordHash: string | undefined;
    if (data.password) {
      const passwordResult = await validateAndHashPassword(data.password);
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
      updatedAt: new Date(),
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

    await db.update(users).set(updates).where(eq(users.id, userId));

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
    console.error("Failed to update user:", error);
    return { success: false, error: "updateUserFailed" };
  }
}

export async function createUser(data: ManagedUserInput): Promise<UserManagementResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "super_admin")) {
    return { success: false, error: "unauthorized" };
  }

  if (!data.username || !data.name) {
    return { success: false, error: "usernameAndNameRequired" };
  }

  try {
    const actorRole = session.user.role as UserRole;
    const normalizedEmail = data.email?.trim() || null;
    const normalizedClassName = data.className?.trim() || null;
    const requestedRole = data.role.trim();

    const roleError = validateRoleChange(actorRole, requestedRole);
    if (roleError === "invalidRole") return { success: false, error: "createUserFailed" };
    if (roleError) return { success: false, error: roleError };
    const validatedRole = requestedRole as UserRole;

    if (await isUsernameTaken(data.username)) {
      return { success: false, error: "usernameInUse" };
    }

    if (normalizedEmail && await isEmailTaken(normalizedEmail)) {
      return { success: false, error: "emailInUse" };
    }

    if (data.password) {
      const passwordResult = await validateAndHashPassword(data.password);
      if (passwordResult.error) {
        return { success: false, error: passwordResult.error };
      }
    }

    const id = nanoid();
    const generatedPassword = generateSecurePassword();
    const passwordToHash = data.password ?? generatedPassword;
    const passwordHash = await hash(passwordToHash, 12);

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

    return {
      success: true,
      generatedPassword: data.password ? undefined : generatedPassword,
    };
  } catch (error) {
    console.error("Failed to create user:", error);
    return { success: false, error: "createUserFailed" };
  }
}
