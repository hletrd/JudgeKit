import { SUBMISSION_ID_VISIBLE_PREFIX_LENGTH } from "./id";

export function formatSubmissionIdPrefix(id: string): string {
  return id.slice(0, SUBMISSION_ID_VISIBLE_PREFIX_LENGTH);
}
