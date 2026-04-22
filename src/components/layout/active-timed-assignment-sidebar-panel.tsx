"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Timer } from "lucide-react";
import type { ActiveTimedAssignmentSummary } from "@/lib/assignments/active-timed-assignments";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatting";

interface ActiveTimedAssignmentSidebarPanelProps {
  assignments: ActiveTimedAssignmentSummary[];
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resolveCurrentAssignmentId(pathname: string, searchAssignmentId: string | null): string | null {
  if (searchAssignmentId) {
    return searchAssignmentId;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "dashboard") {
    return null;
  }

  if (segments[1] === "contests") {
    const assignmentId = segments[2];
    if (assignmentId && assignmentId !== "create" && assignmentId !== "join") {
      return assignmentId;
    }
  }

  if (segments[1] === "groups" && segments[3] === "assignments" && segments[4]) {
    return segments[4];
  }

  return null;
}

export function ActiveTimedAssignmentSidebarPanel({
  assignments,
}: ActiveTimedAssignmentSidebarPanelProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tNav = useTranslations("nav");
  const tContests = useTranslations("contests");
  const locale = useLocale();
  // Per CLAUDE.md: Korean text must use default letter-spacing.
  const labelTracking = locale !== "ko" ? " tracking-[0.16em]" : "";
  const smallLabelTracking = locale !== "ko" ? " tracking-wide" : "";
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    // Only start the timer if at least one assignment hasn't expired yet.
    // If all assignments are past their deadline, there's no need to tick.
    const hasActiveAssignment = assignments.some(
      (assignment) => new Date(assignment.deadline).getTime() > Date.now()
    );
    if (!hasActiveAssignment) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [assignments]);

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => new Date(assignment.deadline).getTime() > nowMs),
    [assignments, nowMs]
  );

  const currentAssignmentId = useMemo(
    () => resolveCurrentAssignmentId(pathname, searchParams.get("assignmentId")),
    [pathname, searchParams]
  );

  const selectedAssignment = useMemo(() => {
    if (activeAssignments.length === 0) {
      return null;
    }

    return activeAssignments.find((assignment) => assignment.assignmentId === currentAssignmentId)
      ?? activeAssignments[0]
      ?? null;
  }, [activeAssignments, currentAssignmentId]);

  if (!selectedAssignment) {
    return null;
  }

  const startedAtMs = new Date(selectedAssignment.startedAt).getTime();
  const deadlineMs = new Date(selectedAssignment.deadline).getTime();
  const totalMs = Math.max(deadlineMs - startedAtMs, 0);
  const elapsedMs = Math.min(Math.max(nowMs - startedAtMs, 0), totalMs);
  const remainingMs = Math.max(deadlineMs - nowMs, 0);
  const progressPercent = totalMs > 0 ? Math.round((elapsedMs / totalMs) * 1000) / 10 : 100;
  const isUrgent = remainingMs <= 5 * 60 * 1000;

  return (
    <div className="group-data-[collapsible=icon]:hidden sticky top-0 z-20 border-b border-sidebar-border bg-sidebar/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-sidebar/85">
      <Link
        href={selectedAssignment.href}
        className="block rounded-xl border border-sidebar-border/80 bg-sidebar-accent/55 p-3 shadow-sm transition hover:bg-sidebar-accent/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        data-testid="active-timed-assignment-panel"
      >
        <div className="flex items-start gap-3">
          <div className={cn(
            "mt-0.5 rounded-lg border border-sidebar-border/70 p-2",
            isUrgent ? "bg-red-500/12 text-red-600 dark:text-red-300" : "bg-sidebar text-sidebar-foreground"
          )}>
            <Timer className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className={`text-[11px] font-semibold uppercase${labelTracking} text-sidebar-foreground/70`}>
              {tNav("activeTimedAssignment")}
            </div>
            <div className="truncate text-sm font-semibold text-sidebar-foreground" data-testid="active-timed-assignment-title">
              {selectedAssignment.title}
            </div>
            <div className="truncate text-xs text-sidebar-foreground/70">
              {selectedAssignment.groupName}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-sidebar-border/70 bg-sidebar/60 p-2">
            <div className={`text-[11px] uppercase${smallLabelTracking} text-sidebar-foreground/65`}>{tNav("remaining")}</div>
            <div className={cn("mt-1 font-mono text-base font-semibold", isUrgent && "text-red-600 dark:text-red-300")} data-testid="active-timed-assignment-remaining">
              {formatDuration(remainingMs)}
            </div>
          </div>
          <div className="rounded-lg border border-sidebar-border/70 bg-sidebar/60 p-2">
            <div className={`text-[11px] uppercase${smallLabelTracking} text-sidebar-foreground/65`}>{tNav("elapsed")}</div>
            <div className="mt-1 font-mono text-base font-semibold text-sidebar-foreground" data-testid="active-timed-assignment-elapsed">
              {formatDuration(elapsedMs)}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <div className={`mb-1 flex items-center justify-between text-[11px] font-medium uppercase${smallLabelTracking} text-sidebar-foreground/65`}>
            <span>{tNav("progress")}</span>
            <span data-testid="active-timed-assignment-progress-label">{formatNumber(progressPercent, { maximumFractionDigits: 1 })}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-sidebar-border/80" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)}>
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-1000 ease-linear",
                isUrgent ? "bg-red-500" : "bg-sidebar-primary"
              )}
              style={{ width: `${Math.min(Math.max(progressPercent, 0), 100)}%` }}
              data-testid="active-timed-assignment-progress-bar"
            />
          </div>
        </div>

        <div className="mt-2 text-[11px] text-sidebar-foreground/65">
          {selectedAssignment.mode === "windowed" ? tContests("modeWindowed") : tContests("modeScheduled")}
        </div>
      </Link>
    </div>
  );
}
