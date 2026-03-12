import type { SubmissionStatus, UserRole } from "@/types";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_SOURCE_CODE_SIZE_BYTES = 256 * 1024;

export const SUBMISSION_RATE_LIMIT_MAX_PER_MINUTE = parseInt(
  process.env.SUBMISSION_RATE_LIMIT_MAX_PER_MINUTE || "5",
  10
);
export const SUBMISSION_MAX_PENDING = parseInt(
  process.env.SUBMISSION_MAX_PENDING || "3",
  10
);
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
];

export function isUserRole(value: string): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

export function canManageRole(actorRole: UserRole, requestedRole: UserRole) {
  if (requestedRole === "super_admin") return actorRole === "super_admin";
  if (requestedRole === "admin") return actorRole === "super_admin";
  return actorRole === "admin" || actorRole === "super_admin";
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
