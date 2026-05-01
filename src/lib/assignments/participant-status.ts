import type { SubmissionStatus } from "@/types";
import { isActiveSubmissionStatus } from "@/lib/submissions/status";

export const ASSIGNMENT_PARTICIPANT_STATUS_VALUES = [
  "not_submitted",
  "in_progress",
  "submitted",
  "pending",
  "queued",
  "judging",
  "accepted",
  "wrong_answer",
  "time_limit",
  "memory_limit",
  "runtime_error",
  "compile_error",
] as const;

export type AssignmentParticipantStatus = (typeof ASSIGNMENT_PARTICIPANT_STATUS_VALUES)[number];

export type AssignmentParticipantStatusParams = {
  latestStatus: SubmissionStatus | null;
  attemptCount: number;
  bestTotalScore: number;
  totalPoints: number;
  examSessionStartedAt?: Date | string | null;
  examSessionPersonalDeadline?: Date | string | null;
  /** Current time in ms — required. Server callers: use `getDbNowMs()`. Client callers: use `Date.now()`. */
  now: number;
};

function toTimestamp(value: Date | string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Check whether an exam session is currently active (started and not yet expired).
 *
 * @param now - Current time in ms. Server-side callers MUST use `getDbNowMs()`
 *   or `getDbNow().getTime()` to avoid clock skew between app and DB servers.
 *   Client-side callers should use `Date.now()` (the only option in the browser).
 */
export function hasActiveExamSession(
  examSessionPersonalDeadline: Date | string | null | undefined,
  now: number,
  examSessionStartedAt?: Date | string | null
): boolean {
  if (!examSessionPersonalDeadline) {
    return false;
  }

  const startedAt = toTimestamp(examSessionStartedAt);
  if (startedAt != null && startedAt > now) {
    return false;
  }

  const deadline = toTimestamp(examSessionPersonalDeadline);
  return deadline != null && deadline >= now;
}

/**
 * Compute the participant status for an assignment row.
 *
 * @param now - Current time in ms. Server-side callers MUST use `getDbNowMs()`
 *   or `getDbNow().getTime()` to avoid clock skew between app and DB servers.
 *   Client-side callers should use `Date.now()` (the only option in the browser).
 */
export function getAssignmentParticipantStatus({
  latestStatus,
  attemptCount,
  bestTotalScore,
  totalPoints,
  examSessionStartedAt,
  examSessionPersonalDeadline,
  now,
}: AssignmentParticipantStatusParams): AssignmentParticipantStatus {
  if (isActiveSubmissionStatus(latestStatus) || latestStatus === "submitted") {
    return latestStatus as AssignmentParticipantStatus;
  }

  const hasPerfectScore = totalPoints > 0 && bestTotalScore >= totalPoints;
  if (hasPerfectScore) {
    return "accepted";
  }

  if (hasActiveExamSession(examSessionPersonalDeadline, now, examSessionStartedAt)) {
    return "in_progress";
  }

  if (attemptCount <= 0) {
    return "not_submitted";
  }

  // A null status with attempts means the submission exists but its status
  // was never set (e.g., worker crash mid-judge). Returning "pending" is more
  // accurate than "submitted" — the latter implies explicit system acceptance,
  // while "pending" correctly signals the submission awaits processing.
  if (latestStatus === null) {
    return "pending";
  }

  if (latestStatus === "accepted") {
    return "submitted";
  }

  return latestStatus;
}
