import { sql } from "drizzle-orm";
import { hashPassword } from "@/lib/security/password-hash";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { canManageRole, isUserRole } from "@/lib/security/constants";
import { getPasswordValidationError, type PasswordValidationError } from "@/lib/security/password";
import type { UserRole } from "@/types";

// ─── Uniqueness checks ────────────────────────────────────────────────────────

/**
 * Returns true when the username is already taken by another user.
 * Pass `excludeId` to allow the current user to keep their own username.
 */
export async function isUsernameTaken(
  username: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await db.query.users.findFirst({
    where: sql`lower(${users.username}) = lower(${username})`,
    columns: { id: true },
  });
  return existing !== undefined && existing.id !== excludeId;
}

/**
 * Returns true when the email is already taken by another user.
 * Pass `excludeId` to allow the current user to keep their own email.
 */
export async function isEmailTaken(
  email: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = lower(${email})`,
    columns: { id: true },
  });
  return existing !== undefined && existing.id !== excludeId;
}

// ─── Password ─────────────────────────────────────────────────────────────────

/**
 * Validates `password` against the password policy and hashes it.
 * Returns `{ hash }` on success or `{ error }` on validation failure.
 * Pass `context` to also reject passwords that contain the username or email prefix.
 */
export async function validateAndHashPassword(
  password: string,
  context?: { username?: string; email?: string | null }
): Promise<{ hash: string; error?: never } | { error: PasswordValidationError; hash?: never }> {
  const validationError = getPasswordValidationError(password, context);
  if (validationError) {
    return { error: validationError };
  }
  return { hash: await hashPassword(password) };
}

// ─── Role validation ──────────────────────────────────────────────────────────

export type RoleValidationError =
  | "invalidRole"
  | "onlySuperAdminCanChangeSuperAdminRole"
  | "cannotChangeSuperAdminRole";

/**
 * Validates that `actorRole` is allowed to assign `requestedRole`,
 * and (when provided) that the target user's current role can be changed.
 *
 * Returns an error key on failure, or null on success.
 */
export function validateRoleChange(
  actorRole: UserRole,
  requestedRole: string,
  targetCurrentRole?: string
): RoleValidationError | null {
  if (!isUserRole(requestedRole)) {
    return "invalidRole";
  }

  if (!canManageRole(actorRole, requestedRole)) {
    return "onlySuperAdminCanChangeSuperAdminRole";
  }

  if (targetCurrentRole === "super_admin" && requestedRole !== "super_admin") {
    return "cannotChangeSuperAdminRole";
  }

  return null;
}
