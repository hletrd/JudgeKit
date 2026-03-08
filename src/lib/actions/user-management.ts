"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { hash } from "bcryptjs";
import { nanoid } from "nanoid";
import { buildServerActionAuditContext, recordAuditEvent } from "@/lib/audit/events";
import { generateSecurePassword } from "@/lib/auth/generated-password";
import {
  canManageRole,
  isUserRole,
} from "@/lib/security/constants";
import { getPasswordValidationError } from "@/lib/security/password";
import type { UserRole } from "@/types";

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
  });

  if (!targetUser) return { success: false, error: "userNotFound" };
  
  if (targetUser.role === "super_admin" && !isActive) {
    return { success: false, error: "cannotDeactivateSuperAdmin" };
  }

  try {
    await db.update(users)
      .set({ isActive, updatedAt: new Date() })
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

export async function editUser(userId: string, data: ManagedUserInput): Promise<UserManagementResult> {
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

    if (!isUserRole(requestedRole)) {
      return { success: false, error: "updateUserFailed" };
    }

    if (!canManageRole(actorRole, requestedRole)) {
      return { success: false, error: "onlySuperAdminCanChangeSuperAdminRole" };
    }

    const existing = await db.query.users.findFirst({
      where: eq(users.username, data.username),
    });

    if (existing && existing.id !== userId) {
      return { success: false, error: "usernameInUse" };
    }

    if (normalizedEmail) {
      const existingEmail = await db.query.users.findFirst({
        where: eq(users.email, normalizedEmail),
      });

      if (existingEmail && existingEmail.id !== userId) {
        return { success: false, error: "emailInUse" };
      }
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!targetUser) return { success: false, error: "userNotFound" };

    // Prevent changing role of super_admin unless you are super_admin
    if (targetUser.role === "super_admin" && requestedRole !== "super_admin" && actorRole !== "super_admin") {
      return { success: false, error: "onlySuperAdminCanChangeSuperAdminRole" };
    }
    // Also prevent changing super_admin role at all, for safety.
    if (targetUser.role === "super_admin" && requestedRole !== "super_admin") {
      return { success: false, error: "cannotChangeSuperAdminRole" };
    }

    if (data.password) {
      const passwordValidationError = getPasswordValidationError(data.password);

      if (passwordValidationError) {
        return { success: false, error: passwordValidationError };
      }
    }

    const updates: UserUpdates = {
      username: data.username,
      email: normalizedEmail,
      name: data.name,
      className: normalizedClassName,
      role: requestedRole,
      updatedAt: new Date(),
    };

    if (data.password) {
      updates.passwordHash = await hash(data.password, 12);
      updates.mustChangePassword = true;
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
        resetPassword: Boolean(data.password),
        role: requestedRole,
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

    if (!isUserRole(requestedRole)) {
      return { success: false, error: "createUserFailed" };
    }

    if (!canManageRole(actorRole, requestedRole)) {
      return { success: false, error: "onlySuperAdminCanChangeSuperAdminRole" };
    }

    const existing = await db.query.users.findFirst({
      where: eq(users.username, data.username),
    });

    if (existing) {
      return { success: false, error: "usernameInUse" };
    }

    if (normalizedEmail) {
      const existingEmail = await db.query.users.findFirst({
        where: eq(users.email, normalizedEmail),
      });

      if (existingEmail) {
        return { success: false, error: "emailInUse" };
      }
    }

    if (data.password) {
      const passwordValidationError = getPasswordValidationError(data.password);

      if (passwordValidationError) {
        return { success: false, error: passwordValidationError };
      }
    }

    const id = nanoid();
    const generatedPassword = generateSecurePassword();
    const passwordToHash =
      data.password ?? generatedPassword;
    const passwordHash = await hash(passwordToHash, 12);

    await db.insert(users).values({
      id,
      username: data.username,
      email: normalizedEmail,
      name: data.name,
      className: normalizedClassName,
      role: requestedRole,
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
        role: requestedRole,
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
