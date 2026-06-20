export type SubmissionStatus = "pending" | "queued" | "judging" | "submitted" | "accepted" | "wrong_answer" | "compile_error" | "runtime_error" | "time_limit_exceeded" | "memory_limit_exceeded" | "output_limit_exceeded" | "internal_error" | "cancelled";

export const ACTIVE_SUBMISSION_STATUSES = new Set<string>(["pending", "queued", "judging"]);

/**
 * Statuses that represent a judged, user-caused outcome — the only ones that
 * should contribute to attempt counts, ICPC penalty, or best-score
 * aggregation. Pending / queued / judging are in-flight; submitted is the
 * manual-grading handoff state; cancelled and internal_error are either
 * user-requested or judge-side failures and must not count against the
 * submitter.
 */
export const TERMINAL_SUBMISSION_STATUSES = [
  "accepted",
  "wrong_answer",
  "compile_error",
  "runtime_error",
  "time_limit_exceeded",
  "memory_limit_exceeded",
  "output_limit_exceeded",
] as const;

/** SQL-ready, quoted + comma-separated form of TERMINAL_SUBMISSION_STATUSES. */
export const TERMINAL_SUBMISSION_STATUSES_SQL_LIST = TERMINAL_SUBMISSION_STATUSES.map(
  (status) => `'${status}'`
).join(", ");

export function isActiveSubmissionStatus(status: string | null | undefined) {
  return Boolean(status && ACTIVE_SUBMISSION_STATUSES.has(status));
}

export function getSubmissionStatusVariant(
  status: string | null | undefined
): "default" | "secondary" | "destructive" {
  if (status === "accepted") {
    return "default";
  }

  if (status === "submitted" || isActiveSubmissionStatus(status)) {
    return "secondary";
  }

  return "destructive";
}
