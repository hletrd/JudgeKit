import type { SubmissionStatus, UserRole } from "@/types";
import { DEFAULT_ROLE_LEVELS } from "@/lib/capabilities/defaults";
import { getRoleLevel } from "@/lib/capabilities/cache";
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
export const SUBMISSION_GLOBAL_QUEUE_LIMIT = parseInt(
  process.env.SUBMISSION_GLOBAL_QUEUE_LIMIT || "100",
  10
);

export const USER_ROLES: readonly UserRole[] = [
  "student",
  "instructor",
  "admin",
  "super_admin",
];

/** Canonical role hierarchy — higher number = more privilege. */
export const ROLE_LEVEL: Record<UserRole, number> = {
  student: 0,
  instructor: 1,
  admin: 2,
  super_admin: 3,
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
 * Check if actor can manage (assign/change) the target role.
 * Works with both built-in and custom roles via level comparison.
 */
export function canManageRole(actorRole: string, requestedRole: string): boolean {
  const actorLevel = getBuiltinRoleLevel(actorRole);
  const requestedLevel = getBuiltinRoleLevel(requestedRole);

  // super_admin can only be assigned by super_admin
  if (requestedRole === "super_admin") return actorRole === "super_admin";
  // Actor must have strictly higher level than the target role
  return actorLevel > requestedLevel;
}

/**
 * Async version of canManageRole that supports custom roles via DB cache.
 */
export async function canManageRoleAsync(actorRole: string, requestedRole: string): Promise<boolean> {
  if (requestedRole === "super_admin") return actorRole === "super_admin";
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
