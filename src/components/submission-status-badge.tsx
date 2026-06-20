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
import { ResourceUsageBar } from "@/components/resource-usage-bar";

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
  memoryLimitMb?: number | null;
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

const STATUS_FULL_KEYS = new Set([
  "pending",
  "queued",
  "judging",
  "accepted",
  "wrong_answer",
  "time_limit_exceeded",
  "memory_limit_exceeded",
  "output_limit_exceeded",
  "internal_error",
  "time_limit",
  "memory_limit",
  "runtime_error",
  "compile_error",
  "canceled",
  "cancelled",
  "submitted",
]);

function statusMessageKey(status: string): string {
  switch (status) {
    case "time_limit_exceeded":
      return "time_limit";
    case "memory_limit_exceeded":
      return "memory_limit";
    default:
      return status;
  }
}

function normalizeStatus(status: string | null | undefined): string | null | undefined {
  switch (status) {
    case "time_limit":
      return "time_limit_exceeded";
    case "memory_limit":
      return "memory_limit_exceeded";
    default:
      return status;
  }
}

function StatusFullName({
  status,
  tSub,
}: { status: string | null | undefined; tSub: ReturnType<typeof useTranslations> }) {
  if (!status || !STATUS_FULL_KEYS.has(status)) return null;
  return (
    <div className="text-sm font-semibold">
      {tSub(`statusFull.${statusMessageKey(status)}` as Parameters<typeof tSub>[0])}
    </div>
  );
}

function TooltipBody({
  status,
  compileOutput,
  executionTimeMs,
  memoryUsedKb,
  failedTestCaseIndex,
  runtimeErrorType,
  timeLimitMs,
  memoryLimitMb,
  score,
  locale,
  tSub,
}: Pick<SubmissionStatusBadgeProps, "status" | "compileOutput" | "executionTimeMs" | "memoryUsedKb" | "failedTestCaseIndex" | "runtimeErrorType" | "timeLimitMs" | "memoryLimitMb" | "score" | "locale"> & { tSub: ReturnType<typeof useTranslations> }) {
  if (status === "compile_error" && compileOutput) {
    const truncated = compileOutput.length > 200
      ? compileOutput.slice(0, 200) + "..."
      : compileOutput;
    return (
      <div className="space-y-1.5">
        <StatusFullName status={status} tSub={tSub} />
        <pre className="max-w-xs whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">
          {truncated}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-1 text-xs">
      <StatusFullName status={status} tSub={tSub} />
      {/* Verdict-specific detail line */}
      {status === "wrong_answer" && failedTestCaseIndex != null && (
        <div className="text-muted-foreground">{tSub("waOnTest", { index: failedTestCaseIndex + 1 })}</div>
      )}
      {status === "wrong_answer" && score !== null && score !== undefined && (
        <span className="font-medium">{tSub("scoreLabel", { score: formatScore(score, locale) })}</span>
      )}
      {status === "time_limit_exceeded" && executionTimeMs != null && (
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
      <div className="space-y-2 pt-1">
        {executionTimeMs !== null && executionTimeMs !== undefined && status !== "time_limit_exceeded" && timeLimitMs != null && timeLimitMs > 0 && (
          <ResourceUsageBar
            current={executionTimeMs}
            limit={timeLimitMs}
            label="Time"
            unit="ms"
            exceeded={status === "time_limit_exceeded"}
            compact
            icon="timer"
            locale={locale}
          />
        )}
        {executionTimeMs !== null && executionTimeMs !== undefined && (timeLimitMs == null || timeLimitMs <= 0) && status !== "time_limit_exceeded" && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Timer aria-hidden="true" className="size-3 shrink-0" />
            {formatBadgeNumber(executionTimeMs, locale)} ms
          </span>
        )}
        {memoryUsedKb !== null && memoryUsedKb !== undefined && memoryLimitMb != null && memoryLimitMb > 0 && (
          <ResourceUsageBar
            current={memoryUsedKb}
            limit={memoryLimitMb * 1024}
            label="Memory"
            unit="KB"
            exceeded={status === "memory_limit_exceeded"}
            compact
            icon="memory"
            locale={locale}
          />
        )}
        {memoryUsedKb !== null && memoryUsedKb !== undefined && (memoryLimitMb == null || memoryLimitMb <= 0) && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
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
  memoryLimitMb,
  score,
  locale,
}: SubmissionStatusBadgeProps) {
  const tSub = useTranslations("submissions");
  const normalizedStatus = normalizeStatus(status);

  const badge = (
    <Badge
      variant={variant ?? getSubmissionStatusVariant(normalizedStatus)}
      className={cn("inline-flex items-center gap-1.5", className)}
      aria-label={label}
    >
      <SubmissionStatusIcon status={normalizedStatus} />
      {showLivePulse && isActiveSubmissionStatus(normalizedStatus) && (
        <span aria-hidden="true" className="inline-flex size-2 rounded-full bg-current animate-pulse" />
      )}
      <span>{label}</span>
    </Badge>
  );

  // Show tooltip whenever there's a known verdict — the full-name expansion
  // alone (e.g., "WA" → "오답 (Wrong Answer)") is reason enough. In-progress
  // statuses skip the tooltip so the live pulse remains uncluttered.
  if (isActiveSubmissionStatus(normalizedStatus) || !normalizedStatus || !STATUS_FULL_KEYS.has(normalizedStatus)) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<button type="button" className="inline-flex cursor-default border-none bg-transparent p-0" />}>{badge}</TooltipTrigger>
        <TooltipContent className="bg-popover/80 text-popover-foreground backdrop-blur-md border border-border/50 shadow-lg" arrowClassName="bg-popover/80 fill-popover/80 backdrop-blur-md">
          <TooltipBody
            status={normalizedStatus}
            compileOutput={compileOutput}
            executionTimeMs={executionTimeMs}
            memoryUsedKb={memoryUsedKb}
            failedTestCaseIndex={failedTestCaseIndex}
            runtimeErrorType={runtimeErrorType}
            timeLimitMs={timeLimitMs}
            memoryLimitMb={memoryLimitMb}
            score={score}
            locale={locale}
            tSub={tSub}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
