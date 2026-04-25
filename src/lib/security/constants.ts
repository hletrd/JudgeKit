import type { SubmissionStatus, UserRole } from "@/types";
import { DEFAULT_ROLE_LEVELS } from "@/lib/capabilities/defaults";
import { getRoleLevel, isSuperAdminRole } from "@/lib/capabilities/cache";
import { getConfiguredSettings } from "@/lib/system-settings-config";

export function getMinPasswordLength() {
  return getConfiguredSettings().minPasswordLength;
}
export function getMaxSourceCodeSizeBytes() {
  return getConfiguredSettings().maxSourceCodeSizeBytes;
}
export function getSubmissionRateLimitMaxPerMinute() {
  return getConfiguredSettings().submissionRateLimitMaxPerMinute;
}
export function getSubmissionMaxPending() {
  return getConfiguredSettings().submissionMaxPending;
}
export function getSubmissionGlobalQueueLimit() {
  return getConfiguredSettings().submissionGlobalQueueLimit;
}

/** @deprecated Use getMinPasswordLength() */
export const MIN_PASSWORD_LENGTH = 8;
/** @deprecated Use getMaxSourceCodeSizeBytes() */
export const MAX_SOURCE_CODE_SIZE_BYTES = 256 * 1024;
/** @deprecated Use getSubmissionGlobalQueueLimit() */
export const SUBMISSION_GLOBAL_QUEUE_LIMIT = (() => {
  const parsed = parseInt(process.env.SUBMISSION_GLOBAL_QUEUE_LIMIT ?? "100", 10);
  return Number.isNaN(parsed) ? 100 : Math.max(0, parsed);
})();

export const USER_ROLES: readonly UserRole[] = [
  "student",
  "assistant",
  "instructor",
  "admin",
  "super_admin",
];

/** Canonical role hierarchy — higher number = more privilege. */
export const ROLE_LEVEL: Record<UserRole, number> = {
  student: 0,
  assistant: 1,
  instructor: 2,
  admin: 3,
  super_admin: 4,
};

export const SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  "pending",
  "queued",
  "judging",
  "accepted",
  "wrong_answer",
  "time_limit",
  "memory_limit",
  "runtime_error",
  "compile_error",
  "submitted",
];

/**
 * Synchronous check for built-in roles. For custom roles, use isValidRoleAsync.
 */
export function isUserRole(value: string): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

/**
 * Async version of canManageRole that supports custom roles via DB cache.
 */
export async function canManageRoleAsync(actorRole: string, requestedRole: string): Promise<boolean> {
  // Roles at super_admin level can only be assigned by super_admin-level roles
  if (await isSuperAdminRole(requestedRole)) return await isSuperAdminRole(actorRole);
  const actorLevel = await getRoleLevel(actorRole);
  const requestedLevel = await getRoleLevel(requestedRole);
  return actorLevel > requestedLevel;
}

/**
 * Get the level for a role. Returns the built-in level synchronously,
 * or -1 for unknown custom roles.
 */
export function getBuiltinRoleLevel(role: string): number {
  return DEFAULT_ROLE_LEVELS[role as UserRole] ?? -1;
}

export function assertUserRole(role: string): UserRole {
  if (!isUserRole(role)) {
    throw new Error(`Invalid user role: ${role}`);
  }
  return role;
}

export function isSubmissionStatus(value: string): value is SubmissionStatus {
  return SUBMISSION_STATUSES.includes(value as SubmissionStatus);
}
