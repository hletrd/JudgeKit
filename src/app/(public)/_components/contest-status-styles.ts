/**
 * Shared styling and formatting utilities for contest pages.
 *
 * Used by both the contest listing page and the public contest list component
 * to ensure consistent styling (including dark mode) across all contest views.
 */

// Re-export the canonical contest status type so all UI modules reference
// a single source of truth instead of defining a duplicate local type.
export type { ContestStatus } from "@/lib/assignments/contests";

import type { ContestStatus } from "@/lib/assignments/contests";

/**
 * Returns the Badge variant for a contest status, color-coded by meaning.
 * Used by both dashboard and public contest listing pages for consistency.
 */
export function getContestStatusBadgeVariant(
  status: ContestStatus
): "secondary" | "success" | "default" | "outline" {
  switch (status) {
    case "upcoming":
      return "secondary";
    case "open":
      return "success";
    case "in_progress":
      return "default";
    case "expired":
    case "closed":
      return "outline";
  }
}

/**
 * Returns the CSS class string for a contest card's left border,
 * color-coded by contest status. Includes dark mode variants.
 */
export function getContestStatusBorderClass(status: ContestStatus): string {
  switch (status) {
    case "upcoming":
      return "border-l-4 border-l-blue-500 dark:border-l-blue-400";
    case "open":
    case "in_progress":
      return "border-l-4 border-l-green-500 dark:border-l-green-400";
    case "expired":
    case "closed":
      return "border-l-4 border-l-gray-400 dark:border-l-gray-500";
  }
}

/**
 * Formats a date value for display in contest pages.
 * Returns a localized date/time string, or the fallback if the value is null.
 */
export function formatDateLabel(value: Date | null, fallback: string, locale: string): string {
  return value
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(value)
    : fallback;
}

/**
 * Build a localized map of contest status labels.
 *
 * Accepts explicit label strings for each status so that callers using
 * different translation namespaces (e.g. `publicShell` with nested keys vs
 * `contests` with flat keys) can both use this shared function.
 *
 * Centralises the status-to-label-key mapping so that adding a new contest
 * status only requires updating this function and its callers.
 *
 * @example
 * // Public pages using nested keys under "publicShell":
 * const t = getTranslations("publicShell");
 * const labels = buildContestStatusLabels({
 *   upcoming: t("contests.status.upcoming"),
 *   open: t("contests.status.open"),
 *   in_progress: t("contests.status.inProgress"),
 *   expired: t("contests.status.expired"),
 *   closed: t("contests.status.closed"),
 * });
 *
 * // Dashboard pages using flat keys under "contests":
 * const t = getTranslations("contests");
 * const labels = buildContestStatusLabels({
 *   upcoming: t("statusUpcoming"),
 *   open: t("statusOpen"),
 *   in_progress: t("statusInProgress"),
 *   expired: t("statusExpired"),
 *   closed: t("statusClosed"),
 * });
 */
export function buildContestStatusLabels(labels: {
  upcoming: string;
  open: string;
  in_progress: string;
  expired: string;
  closed: string;
}): Record<ContestStatus, string> {
  return labels;
}

export type ExamModeKey = "none" | "scheduled" | "windowed";
export type ScoringModelKey = "ioi" | "icpc";

/**
 * Returns the CSS class string for an exam mode badge.
 * Used by all contest pages for consistent badge styling including dark mode.
 * The "none" mode defaults to the "windowed" style as a fallback,
 * since exam badges are not rendered when examMode is "none".
 */
export function getExamModeBadgeClass(mode: ExamModeKey): string {
  return mode === "scheduled"
    ? "text-xs bg-blue-500 text-white dark:bg-blue-600 dark:text-white"
    : "text-xs bg-purple-500 text-white dark:bg-purple-600 dark:text-white";
}

/**
 * Returns the CSS class string for a scoring model badge.
 * Used by all contest pages for consistent badge styling including dark mode.
 */
export function getScoringModelBadgeClass(model: ScoringModelKey): string {
  return model === "icpc"
    ? "text-xs bg-orange-500 text-white dark:bg-orange-600 dark:text-white"
    : "text-xs bg-teal-500 text-white dark:bg-teal-600 dark:text-white";
}
