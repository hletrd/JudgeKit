"use client";

import { AlertTriangle, CheckCircle2, Clock3, Timer, HardDrive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  getSubmissionStatusVariant,
  isActiveSubmissionStatus,
} from "@/lib/submissions/status";

type SubmissionStatusBadgeProps = {
  status: string | null | undefined;
  label: string;
  className?: string;
  showLivePulse?: boolean;
  variant?: "default" | "secondary" | "destructive" | "outline";
  compileOutput?: string | null;
  executionTimeMs?: number | null;
  memoryUsedKb?: number | null;
  score?: number | null;
};

function SubmissionStatusIcon({ status }: { status: string | null | undefined }) {
  if (status === "accepted") {
    return <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" />;
  }

  if (isActiveSubmissionStatus(status)) {
    return <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />;
  }

  return <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function TooltipBody({
  status,
  compileOutput,
  executionTimeMs,
  memoryUsedKb,
  score,
}: Pick<SubmissionStatusBadgeProps, "status" | "compileOutput" | "executionTimeMs" | "memoryUsedKb" | "score">) {
  if (status === "compile_error" && compileOutput) {
    const truncated = compileOutput.length > 200
      ? compileOutput.slice(0, 200) + "..."
      : compileOutput;
    return (
      <pre className="max-w-xs whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">
        {truncated}
      </pre>
    );
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      {status === "wrong_answer" && score !== null && score !== undefined && (
        <span className="font-medium">Score: {score}</span>
      )}
      {executionTimeMs !== null && executionTimeMs !== undefined && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Timer aria-hidden="true" className="size-3 shrink-0" />
          {formatNumber(executionTimeMs)} ms
        </span>
      )}
      {memoryUsedKb !== null && memoryUsedKb !== undefined && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <HardDrive aria-hidden="true" className="size-3 shrink-0" />
          {formatNumber(memoryUsedKb)} KB
        </span>
      )}
    </div>
  );
}

export function SubmissionStatusBadge({
  status,
  label,
  className,
  showLivePulse = false,
  variant,
  compileOutput,
  executionTimeMs,
  memoryUsedKb,
  score,
}: SubmissionStatusBadgeProps) {
  const badge = (
    <Badge
      variant={variant ?? getSubmissionStatusVariant(status)}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <SubmissionStatusIcon status={status} />
      {showLivePulse && isActiveSubmissionStatus(status) && (
        <span aria-hidden="true" className="inline-flex size-2 rounded-full bg-current animate-pulse" />
      )}
      <span>{label}</span>
    </Badge>
  );

  // Only show tooltip for terminal statuses with detail data
  const hasDetail =
    compileOutput != null ||
    executionTimeMs != null ||
    memoryUsedKb != null ||
    score != null;

  if (!hasDetail || isActiveSubmissionStatus(status)) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>{badge}</TooltipTrigger>
        <TooltipContent className="bg-popover/80 text-popover-foreground backdrop-blur-md border border-border/50 shadow-lg" arrowClassName="bg-popover/80 fill-popover/80 backdrop-blur-md">
          <TooltipBody
            status={status}
            compileOutput={compileOutput}
            executionTimeMs={executionTimeMs}
            memoryUsedKb={memoryUsedKb}
            score={score}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
