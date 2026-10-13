export type ProblemSubmissionHistoryRow = {
  id: string;
  language: string;
  status: string;
  score: number | null;
  /** Epoch milliseconds. */
  submittedAt: number | null;
  executionTimeMs: number | null;
  memoryUsedKb: number | null;
  failedTestCaseIndex: number | null;
  runtimeErrorType: string | null;
};

/**
 * Rows for the "my submissions for this problem" list on a submission page.
 *
 * The server sends the viewer's OTHER submissions for the problem. When the
 * viewer owns the submission being shown it belongs in that list too, and it
 * must carry the page's live state: right after submitting the server render
 * still says "pending", and the verdict only arrives through polling.
 * Newest first; rows without a timestamp sink to the bottom.
 */
export function withCurrentSubmission(
  otherRows: readonly ProblemSubmissionHistoryRow[],
  current: ProblemSubmissionHistoryRow | null,
): ProblemSubmissionHistoryRow[] {
  if (!current) {
    return [...otherRows];
  }

  return [current, ...otherRows.filter((row) => row.id !== current.id)].sort((a, b) => {
    if (a.submittedAt === b.submittedAt) return 0;
    if (a.submittedAt === null) return 1;
    if (b.submittedAt === null) return -1;
    return b.submittedAt - a.submittedAt;
  });
}
