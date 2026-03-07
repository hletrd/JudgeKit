"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { hash } from "bcryptjs";
import { nanoid } from "nanoid";

export async function toggleUserActive(userId: string, isActive: boolean) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "super_admin")) {
    return { success: false, error: "Unauthorized" };
  }

  // Prevent deactivating yourself
  if (userId === session.user.id) {
    return { success: false, error: "Cannot deactivate yourself" };
  }

  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!targetUser) return { success: false, error: "User not found" };
  
  if (targetUser.role === "super_admin" && !isActive) {
    return { success: false, error: "Cannot deactivate super_admin" };
  }

  try {
    await db.update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return { success: true };
  } catch (error) {
    return { success: false, error: "Failed to update user status" };
  }
}

export async function editUser(userId: string, data: { username: string; email?: string; name: string; role: string; password?: string }) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "super_admin")) {
    return { success: false, error: "Unauthorized" };
  }

  if (!data.username || !data.name) {
    return { success: false, error: "Username and name are required" };
  }

  try {
    const existing = await db.query.users.findFirst({
      where: eq(users.username, data.username),
    });

    if (existing && existing.id !== userId) {
      return { success: false, error: "Username already in use" };
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!targetUser) return { success: false, error: "User not found" };

    // Prevent changing role of super_admin unless you are super_admin
    if (targetUser.role === "super_admin" && data.role !== "super_admin" && session.user.role !== "super_admin") {
      return { success: false, error: "Only super_admin can change super_admin role" };
    }
    // Also prevent changing super_admin role at all, for safety.
    if (targetUser.role === "super_admin" && data.role !== "super_admin") {
      return { success: false, error: "Cannot change role of super_admin" };
    }

    const updates: any = {
      username: data.username,
      email: data.email || null,
      name: data.name,
      role: data.role,
      updatedAt: new Date(),
    };

    if (data.password && data.password.length >= 8) {
      updates.passwordHash = await hash(data.password, 12);
    }

    await db.update(users).set(updates).where(eq(users.id, userId));

    return { success: true };
  } catch (error) {
    return { success: false, error: "Failed to update user" };
  }
}

export async function createUser(data: { username: string; email?: string; name: string; role: string; password?: string }) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "super_admin")) {
    return { success: false, error: "Unauthorized" };
  }

  if (!data.username || !data.name) {
    return { success: false, error: "Username and name are required" };
  }

  try {
    const existing = await db.query.users.findFirst({
      where: eq(users.username, data.username),
    });

    if (existing) {
      return { success: false, error: "Username already in use" };
    }

    const id = nanoid();
    const passwordToHash = data.password && data.password.length >= 8 ? data.password : "password123";
    const passwordHash = await hash(passwordToHash, 12);

    await db.insert(users).values({
      id,
      username: data.username,
      email: data.email || null,
      name: data.name,
      role: data.role,
      passwordHash,
      isActive: true,
      mustChangePassword: true, // force new user to change password on first login
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: "Failed to create user" };
  }
}
