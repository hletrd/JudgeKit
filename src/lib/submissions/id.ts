import { randomBytes } from "node:crypto";

export const SUBMISSION_ID_LENGTH = 32;
export const SUBMISSION_ID_VISIBLE_PREFIX_LENGTH = 12;

export function generateSubmissionId(): string {
  return randomBytes(SUBMISSION_ID_LENGTH / 2).toString("hex");
}

export function formatSubmissionIdPrefix(id: string): string {
  return id.slice(0, SUBMISSION_ID_VISIBLE_PREFIX_LENGTH);
}
