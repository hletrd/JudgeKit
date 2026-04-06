export const ACTIVE_SUBMISSION_STATUSES = new Set(["pending", "queued", "judging"]);

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
