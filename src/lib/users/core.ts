import { sql } from "drizzle-orm";
import { hashPassword } from "@/lib/security/password-hash";
import { db, type TransactionClient } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { canManageRoleAsync, isUserRole } from "@/lib/security/constants";
import { isValidRole, isSuperAdminRole } from "@/lib/capabilities/cache";
import { getPasswordValidationError, type PasswordValidationError } from "@/lib/security/password";

// ─── Uniqueness checks ────────────────────────────────────────────────────────

/**
 * Returns true when the username is already taken by another user.
 * Pass `excludeId` to allow the current user to keep their own username.
 * Pass `queryDb` to run inside a transaction (for TOCTOU prevention).
 */
export async function isUsernameTaken(
  username: string,
  excludeId?: string,
  queryDb?: TransactionClient
): Promise<boolean> {
  const executor = queryDb ?? db;
  const [existing] = await executor
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);
  return existing !== undefined && existing.id !== excludeId;
}

/**
 * Returns true when the email is already taken by another user.
 * Pass `excludeId` to allow the current user to keep their own email.
 * Pass `queryDb` to run inside a transaction (for TOCTOU prevention).
 */
export async function isEmailTaken(
  email: string,
  excludeId?: string,
  queryDb?: TransactionClient
): Promise<boolean> {
  const executor = queryDb ?? db;
  const [existing] = await executor
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  return existing !== undefined && existing.id !== excludeId;
}

// ─── Password ─────────────────────────────────────────────────────────────────

/**
 * Validates `password` against the password policy and hashes it.
 * Returns `{ hash }` on success or `{ error }` on validation failure.
 */
export async function validateAndHashPassword(
  password: string,
): Promise<{ hash: string; error?: never } | { error: PasswordValidationError; hash?: never }> {
  const validationError = getPasswordValidationError(password);
  if (validationError) {
    return { error: validationError };
  }
  return { hash: await hashPassword(password) };
}

// ─── Role validation ──────────────────────────────────────────────────────────

export type RoleValidationError =
  | "invalidRole"
  | "onlySuperAdminCanChangeSuperAdminRole"
  | "roleAssignmentNotAllowed"
  | "cannotChangeSuperAdminRole";

/**
 * Validates that `actorRole` is allowed to assign `requestedRole`,
 * and (when provided) that the target user's current role can be changed.
 * Uses capability-based role level comparison to properly handle custom roles.
 */
export async function validateRoleChangeAsync(
  actorRole: string,
  requestedRole: string,
  targetCurrentRole?: string
): Promise<RoleValidationError | null> {
  if (!isUserRole(requestedRole) && !(await isValidRole(requestedRole))) {
    return "invalidRole";
  }

  if (!(await canManageRoleAsync(actorRole, requestedRole))) {
    // Return a specific error for super-admin level escalation attempts,
    // and a generic error for all other role escalation failures.
    return (await isSuperAdminRole(requestedRole))
      ? "onlySuperAdminCanChangeSuperAdminRole"
      : "roleAssignmentNotAllowed";
  }

  if (targetCurrentRole && (await isSuperAdminRole(targetCurrentRole)) && !(await isSuperAdminRole(requestedRole))) {
    return "cannotChangeSuperAdminRole";
  }

  return null;
}
