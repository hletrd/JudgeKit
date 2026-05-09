"use client";

import { cn } from "@/lib/utils";
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

function formatValue(value: number, unit: string): string {
  if (unit === "ms" && value >= 1000) {
    return `${(value / 1000).toFixed(2)}s`;
  }
  if (unit === "KB" && value >= 1024) {
    return `${(value / 1024).toFixed(1)}MB`;
  }
  if (unit === "MB" && value >= 1024) {
    return `${(value / 1024).toFixed(2)}GB`;
  }
  return `${Math.round(value)}${unit}`;
}

export function ResourceUsageBar({
  current,
  limit,
  label,
  unit,
  exceeded = false,
  compact = false,
  icon,
}: ResourceUsageBarProps) {
  const percentage = limit > 0 ? (current / limit) * 100 : 0;
  const clampedPercentage = Math.min(percentage, 100);
  const colorClass = getUsageColor(percentage, exceeded);

  const IconComponent = icon === "timer" ? Timer : icon === "memory" ? HardDrive : null;

  if (compact) {
    return (
      <div className="w-full min-w-[120px] space-y-0.5">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {IconComponent && <IconComponent aria-hidden="true" className="size-3 shrink-0" />}
          <span className="tabular-nums">{formatValue(current, unit)}</span>
          <span className="text-muted-foreground/60">/ {formatValue(limit, unit)}</span>
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
          {formatValue(current, unit)}
          <span className="text-muted-foreground/60 ml-1">/ {formatValue(limit, unit)}</span>
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
