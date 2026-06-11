/**
 * Effective end-of-exam for ONE participant (RPF cycle-3 AGG3-1).
 *
 * "When does the exam stop running for user X?" was answered independently
 * by the submission validator (`submissions.ts` — honors a staff-extended
 * `exam_sessions.personal_deadline` past the assignment close), late-penalty
 * scoring (SQL keyed on `personal_deadline`), and the anti-cheat ingest
 * (`assignment.deadline` only — the cycle-3 bug: telemetry went dark and
 * submissions accrued false `submission_stale_heartbeat` flags during
 * accommodation windows). This helper is the single owner of that contract.
 *
 * Semantics (extension-only, mirrors `validateAssignmentSubmission`):
 *  - windowed exams: the LATER of the assignment close and the participant's
 *    `personal_deadline` (a staff extension may exceed the assignment close
 *    by design — see `extendExamSession`). A personal deadline EARLIER than
 *    the assignment close never shrinks the window here: pre-close behavior
 *    (e.g. accepting telemetry from a participant who has not started a
 *    session yet) is preserved, and stricter per-session checks remain the
 *    submission validator's responsibility.
 *  - all other modes: the assignment close.
 *  - `null` means "no close" (no deadline configured).
 */
export function getEffectiveExamCloseAt(
  assignment: { examMode: string; deadline: Date | null },
  personalDeadline: Date | null
): Date | null {
  if (assignment.examMode === "windowed" && personalDeadline) {
    if (!assignment.deadline || personalDeadline.getTime() > assignment.deadline.getTime()) {
      return personalDeadline;
    }
  }
  return assignment.deadline;
}
