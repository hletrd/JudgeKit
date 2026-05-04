"use client";

import { useEffect } from "react";
import { useLectureMode } from "@/components/lecture/lecture-mode-provider";
import { LectureProblemView } from "@/components/lecture/lecture-problem-view";
import { SubmissionOverview } from "@/components/lecture/submission-overview";

export function ProblemLectureWrapper({
  problemId,
  problemTitle,
  assignmentId,
  problemPanel,
  codePanel,
  defaultView,
}: {
  problemId: string;
  problemTitle: string;
  assignmentId?: string | null;
  problemPanel: React.ReactNode;
  codePanel: React.ReactNode;
  defaultView: React.ReactNode;
}) {
  const { active, showStats, closeStats, setStatsAvailable } = useLectureMode();

  useEffect(() => {
    setStatsAvailable(true);
    return () => {
      setStatsAvailable(false);
      closeStats();
    };
  }, [closeStats, setStatsAvailable]);

  if (!active) {
    return <>{defaultView}</>;
  }

  return (
    <>
      <LectureProblemView
        problemPanel={problemPanel}
        codePanel={codePanel}
        problemTitle={problemTitle}
      />
      <SubmissionOverview
        assignmentId={assignmentId ?? null}
        problemId={problemId}
        open={showStats}
        onClose={closeStats}
      />
    </>
  );
}
