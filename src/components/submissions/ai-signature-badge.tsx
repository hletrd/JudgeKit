"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type AiSignatureBadgeMatch = {
  token: string;
  problemId: string;
  problemTitle: string | null;
};

type AiSignatureBadgeProps = {
  matches: readonly AiSignatureBadgeMatch[];
  /** Icon only (dense tables); the label stays available to screen readers. */
  compact?: boolean;
  className?: string;
};

/**
 * "AI suspected" marker for a submission whose source contains a problem's
 * `{{signature: token}}` token. Render it only with data from
 * src/lib/submissions/ai-signature-flags.ts, which is manager-scoped.
 */
export function AiSignatureBadge({ matches, compact = false, className }: AiSignatureBadgeProps) {
  const t = useTranslations("submissions.aiSignature");
  if (matches.length === 0) return null;

  const lines = matches.map((match) => ({
    key: `${match.problemId}:${match.token}`,
    text: t("match", { token: match.token, problem: match.problemTitle ?? t("unknownProblem") }),
  }));
  const label = `${t("badge")}: ${lines.map((line) => line.text).join(", ")}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={label}
              data-testid="ai-signature-badge"
              className={cn("inline-flex cursor-default border-none bg-transparent p-0 align-middle", className)}
            />
          }
        >
          {compact ? (
            <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          ) : (
            <Badge
              variant="outline"
              className="gap-1 border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
            >
              <ShieldAlert className="size-3.5" aria-hidden="true" />
              {t("badge")}
            </Badge>
          )}
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-medium">{t("tooltipTitle")}</p>
            <ul className="space-y-0.5">
              {lines.map((line) => (
                <li key={line.key} className="font-mono">{line.text}</li>
              ))}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
