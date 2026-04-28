/**
 * Shared styling and formatting utilities for contest pages.
 *
 * Used by both the contest listing page and the public contest list component
 * to ensure consistent styling (including dark mode) across all contest views.
 */

export type ContestStatusKey =
  | "upcoming"
  | "open"
  | "in_progress"
  | "expired"
  | "closed";

/**
 * Returns the CSS class string for a contest card's left border,
 * color-coded by contest status. Includes dark mode variants.
 */
/**
 * Returns the Badge variant for a contest status, color-coded by meaning.
 * Used by both dashboard and public contest listing pages for consistency.
 */
export function getContestStatusBadgeVariant(
  status: ContestStatusKey
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

export function getContestStatusBorderClass(status: ContestStatusKey): string {
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
