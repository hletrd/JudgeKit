import type { UserRole } from "@/types";
import { ROLE_LEVEL } from "@/lib/security/constants";

/**
 * Returns true if `userRole` meets or exceeds `requiredRole` in the privilege
 * hierarchy defined by ROLE_LEVEL (student < instructor < admin < super_admin).
 */
export function isAtLeastRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole];
}

/**
 * Returns true for admin or super_admin — the roles that can manage users,
 * see all groups, view audit logs, etc.
 */
export function canManageUsers(role: UserRole): boolean {
  return isAtLeastRole(role, "admin");
}

/**
 * Returns true for instructor, admin, or super_admin — roles that can create
 * problems, manage assignments, and view privileged submission data.
 */
export function isInstructorOrAbove(role: UserRole): boolean {
  return isAtLeastRole(role, "instructor");
}
