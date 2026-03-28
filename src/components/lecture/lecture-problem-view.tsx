"use client";

import { useLectureMode } from "./lecture-mode-provider";
import { cn } from "@/lib/utils";

type LectureProblemViewProps = {
  problemPanel: React.ReactNode;
  codePanel: React.ReactNode;
  problemTitle: string;
};

export function LectureProblemView({ problemPanel, codePanel, problemTitle }: LectureProblemViewProps) {
  const { panelLayout, fontScale } = useLectureMode();

  return (
    <div className="flex h-[calc(100vh-4.5rem)] gap-0 overflow-hidden rounded-lg border">
      {/* Problem panel */}
      {panelLayout !== "code" && (
        <div className={cn(
          "flex flex-col overflow-hidden border-r",
          panelLayout === "split" ? "w-1/2" : "w-full"
        )}>
          <div className="lecture-panel-header flex items-center gap-2">
            <span>Problem</span>
            <span className="text-muted-foreground">—</span>
            <span className="truncate">{problemTitle}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {problemPanel}
          </div>
        </div>
      )}

      {/* Code panel */}
      {panelLayout !== "problem" && (
        <div className={cn(
          "flex flex-col overflow-hidden",
          panelLayout === "split" ? "w-1/2" : "w-full"
        )}>
          <div className="lecture-panel-header">Code</div>
          <div className="flex-1 overflow-y-auto p-4">
            {codePanel}
          </div>
        </div>
      )}
    </div>
  );
}
