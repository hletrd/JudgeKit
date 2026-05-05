"use client";

import { AlertTriangle, CheckCircle2, Clock3, Timer, HardDrive } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { formatNumber, formatScore } from "@/lib/formatting";

type SubmissionStatusBadgeProps = {
  status: string | null | undefined;
  label: string;
  className?: string;
  showLivePulse?: boolean;
  variant?: "default" | "secondary" | "destructive" | "outline";
  compileOutput?: string | null;
  executionTimeMs?: number | null;
  memoryUsedKb?: number | null;
  failedTestCaseIndex?: number | null;
  runtimeErrorType?: string | null;
  timeLimitMs?: number | null;
  score?: number | null;
  /** Locale for number formatting. Defaults to "en-US". */
  locale?: string;
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

function formatBadgeNumber(n: number, locale?: string): string {
  return formatNumber(n, locale);
}

const RUNTIME_ERROR_KEYS: Record<string, string> = {
  SIGSEGV: "runtimeErrors.SIGSEGV",
  SIGFPE: "runtimeErrors.SIGFPE",
  SIGABRT: "runtimeErrors.SIGABRT",
  SIGXCPU: "runtimeErrors.SIGXCPU",
  SIGKILL: "runtimeErrors.SIGKILL",
  stack_overflow: "runtimeErrors.stack_overflow",
};

function TooltipBody({
  status,
  compileOutput,
  executionTimeMs,
  memoryUsedKb,
  failedTestCaseIndex,
  runtimeErrorType,
  timeLimitMs,
  score,
  locale,
  tSub,
}: Pick<SubmissionStatusBadgeProps, "status" | "compileOutput" | "executionTimeMs" | "memoryUsedKb" | "failedTestCaseIndex" | "runtimeErrorType" | "timeLimitMs" | "score" | "locale"> & { tSub: ReturnType<typeof useTranslations> }) {
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
    <div className="space-y-1 text-xs">
      {/* Verdict-specific detail line */}
      {status === "wrong_answer" && failedTestCaseIndex != null && (
        <div className="text-muted-foreground">{tSub("waOnTest", { index: failedTestCaseIndex + 1 })}</div>
      )}
      {status === "wrong_answer" && score !== null && score !== undefined && (
        <span className="font-medium">{tSub("scoreLabel", { score: formatScore(score, locale) })}</span>
      )}
      {status === "time_limit" && executionTimeMs != null && (
        <div className="text-muted-foreground">
          {formatBadgeNumber(executionTimeMs, locale)} ms / {timeLimitMs != null ? `${formatBadgeNumber(timeLimitMs, locale)} ms` : "—"}
        </div>
      )}
      {status === "runtime_error" && (
        <div className="text-muted-foreground">
          {runtimeErrorType ? (RUNTIME_ERROR_KEYS[runtimeErrorType] ? tSub(RUNTIME_ERROR_KEYS[runtimeErrorType] as Parameters<typeof tSub>[0]) : runtimeErrorType) : tSub("runtimeErrorFallback")}
        </div>
      )}

      {/* Resource usage */}
      <div className="flex items-center gap-3">
        {executionTimeMs !== null && executionTimeMs !== undefined && status !== "time_limit" && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Timer aria-hidden="true" className="size-3 shrink-0" />
            {formatBadgeNumber(executionTimeMs, locale)} ms
          </span>
        )}
        {memoryUsedKb !== null && memoryUsedKb !== undefined && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <HardDrive aria-hidden="true" className="size-3 shrink-0" />
            {formatBadgeNumber(memoryUsedKb, locale)} KB
          </span>
        )}
      </div>
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
  failedTestCaseIndex,
  runtimeErrorType,
  timeLimitMs,
  score,
  locale,
}: SubmissionStatusBadgeProps) {
  const tSub = useTranslations("submissions");

  const badge = (
    <Badge
      variant={variant ?? getSubmissionStatusVariant(status)}
      className={cn("inline-flex items-center gap-1.5", className)}
      aria-label={label}
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
    failedTestCaseIndex != null ||
    runtimeErrorType != null ||
    score != null;

  if (!hasDetail || isActiveSubmissionStatus(status)) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<button type="button" className="inline-flex cursor-default border-none bg-transparent p-0" />}>{badge}</TooltipTrigger>
        <TooltipContent className="bg-popover/80 text-popover-foreground backdrop-blur-md border border-border/50 shadow-lg" arrowClassName="bg-popover/80 fill-popover/80 backdrop-blur-md">
          <TooltipBody
            status={status}
            compileOutput={compileOutput}
            executionTimeMs={executionTimeMs}
            memoryUsedKb={memoryUsedKb}
            failedTestCaseIndex={failedTestCaseIndex}
            runtimeErrorType={runtimeErrorType}
            timeLimitMs={timeLimitMs}
            score={score}
            locale={locale}
            tSub={tSub}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
