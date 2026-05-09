"use client";

import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatting";
import { Timer, HardDrive } from "lucide-react";

type ResourceUsageBarProps = {
  /** Current usage value */
  current: number;
  /** Maximum limit value */
  limit: number;
  /** Label to display (e.g., "Time", "Memory") */
  label?: string;
  /** Unit suffix (e.g., "ms", "KB", "MB") */
  unit: string;
  /** Whether the limit was exceeded (shows red regardless of percentage) */
  exceeded?: boolean;
  /** Compact mode: smaller display for table cells */
  compact?: boolean;
  /** Icon to show before the label */
  icon?: "timer" | "memory";
  /** Locale for number formatting. Defaults to "en-US". */
  locale?: string;
};

function getUsageColor(percentage: number, exceeded: boolean): string {
  if (exceeded || percentage > 100) {
    return "bg-red-500";
  }
  if (percentage >= 80) {
    return "bg-orange-500";
  }
  if (percentage >= 50) {
    return "bg-yellow-500";
  }
  return "bg-green-500";
}

function formatValue(value: number, unit: string, locale?: string): string {
  const safeValue = Number.isFinite(value) && value >= 0 ? value : 0;
  if (unit === "ms" && safeValue >= 1000) {
    return `${formatNumber(+(safeValue / 1000).toFixed(2), locale)}s`;
  }
  if (unit === "KB" && safeValue >= 1024) {
    return `${formatNumber(+(safeValue / 1024).toFixed(1), locale)}MB`;
  }
  if (unit === "MB" && safeValue >= 1024) {
    return `${formatNumber(+(safeValue / 1024).toFixed(2), locale)}GB`;
  }
  return `${formatNumber(Math.round(safeValue), locale)}${unit}`;
}

export function ResourceUsageBar({
  current,
  limit,
  label,
  unit,
  exceeded = false,
  compact = false,
  icon,
  locale,
}: ResourceUsageBarProps) {
  const safeCurrent = Number.isFinite(current) && current >= 0 ? current : 0;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 0;
  const percentage = safeLimit > 0 ? (safeCurrent / safeLimit) * 100 : 0;
  const clampedPercentage = Math.min(percentage, 100);
  const colorClass = getUsageColor(percentage, exceeded);

  const IconComponent = icon === "timer" ? Timer : icon === "memory" ? HardDrive : null;

  if (compact) {
    return (
      <div className="w-full min-w-[120px] space-y-0.5">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {IconComponent && <IconComponent aria-hidden="true" className="size-3 shrink-0" />}
          <span className="tabular-nums">{formatValue(current, unit, locale)}</span>
          <span className="text-muted-foreground/60">/ {formatValue(limit, unit, locale)}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", colorClass)}
            style={{ width: `${clampedPercentage}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          {IconComponent && <IconComponent aria-hidden="true" className="size-3 shrink-0" />}
          {label}
        </span>
        <span className="tabular-nums font-medium">
          {formatValue(current, unit, locale)}
          <span className="text-muted-foreground/60 ml-1">/ {formatValue(limit, unit, locale)}</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", colorClass)}
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>
    </div>
  );
}
