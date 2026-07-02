import { resolveCapabilities, getRoleLevel } from "@/lib/capabilities/cache";

/**
 * Async version that supports custom roles via the capability cache.
 * @deprecated Unused; prefer synchronous capability checks where possible.
 */
export async function isAtLeastRoleAsync(userRole: string, requiredRole: string): Promise<boolean> {
  const userLevel = await getRoleLevel(userRole);
  const requiredLevel = await getRoleLevel(requiredRole);
  return userLevel >= requiredLevel;
}

/**
 * Async version that checks capabilities for custom role support.
 * @deprecated Unused; prefer synchronous capability checks where possible.
 */
export async function canManageUsersAsync(role: string): Promise<boolean> {
  const caps = await resolveCapabilities(role);
  return caps.has("users.view") && caps.has("users.edit");
}

/**
 * Async version that checks capabilities for custom role support.
 * @deprecated Unused; prefer synchronous capability checks where possible.
 */
export async function isInstructorOrAboveAsync(role: string): Promise<boolean> {
  const caps = await resolveCapabilities(role);
  return caps.has("problems.create") || caps.has("submissions.view_all");
}
