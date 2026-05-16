import type { TimelineTranslations } from "@/components/contest/participant-timeline-bar";

/**
 * Minimal translator surface needed to build the participant-timeline-bar
 * translations bag. Compatible with `getTranslations("contests.participantAudit")`
 * from `next-intl/server` (which returns a callable plus an `.has` helper —
 * we only use the callable form).
 */
type ParticipantAuditTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/**
 * Build the `TimelineTranslations` bag from a `participantAudit` translator.
 * Centralises the bag layout so both call sites
 * (`participant-timeline-view.tsx` and
 *  `(public)/contests/manage/[assignmentId]/students/[userId]/page.tsx`)
 * stay in sync.
 *
 * Extracted in cycle 11 (ARCH11-2 / CRIT11-2).
 */
export function buildParticipantTimelineTranslations(
  t: ParticipantAuditTranslator,
): TimelineTranslations {
  return {
    noSubmissions: t("submissionHistory.noSubmissions"),
    firstAccepted: t("problemSummary.firstAccepted"),
    codeSnapshot: (chars: number) => t("problemSummary.codeSnapshot", { chars }),
    attempts: (count: number) => t("problemSummary.attempts", { count }),
    tries: (count: number) => t("problemSummary.tries", { count }),
    best: (score: string | number) => t("problemSummary.best", { score }),
    axisStart: t("timelineBar.axisStart"),
    scoreLabel: (score: string) => t("timelineBar.scoreLabel", { score }),
    durationLong: (hours: number, minutes: number, seconds: number) =>
      t("timelineBar.durationLong", { hours, minutes, seconds }),
    durationShort: (minutes: number, seconds: number) =>
      t("timelineBar.durationShort", { minutes, seconds }),
    snapshotMarkerLabel: (problemTitle: string, when: string) =>
      t("timelineBar.snapshotMarkerLabel", { problemTitle, when }),
  };
}
