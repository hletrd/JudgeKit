"use client";

import { useState } from "react";
import { useLectureMode } from "@/components/lecture/lecture-mode-provider";
import { LectureProblemView } from "@/components/lecture/lecture-problem-view";
import { SubmissionOverview } from "@/components/lecture/submission-overview";

export function ProblemLectureWrapper({
  problemId,
  problemTitle,
  problemPanel,
  codePanel,
  defaultView,
}: {
  problemId: string;
  problemTitle: string;
  problemPanel: React.ReactNode;
  codePanel: React.ReactNode;
  defaultView: React.ReactNode;
}) {
  const { active } = useLectureMode();
  const [showStats, setShowStats] = useState(false);

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
        problemId={problemId}
        open={showStats}
        onClose={() => setShowStats(false)}
      />
    </>
  );
}
