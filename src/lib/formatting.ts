const DEFAULT_LOCALE = "en-US";

type FormatNumberOptions = {
  /** Locale for digit grouping conventions. Defaults to "en-US". */
  locale?: string | string[];
  /** Minimum fraction digits to display. */
  minimumFractionDigits?: number;
  /** Maximum fraction digits to display. */
  maximumFractionDigits?: number;
};

/**
 * Format a number using the given locale's digit grouping conventions.
 *
 * Prefer this over `.toLocaleString("en-US")` or `.toFixed()` for any
 * user-facing number display so that future locale additions (e.g., Arabic,
 * Hindi) are handled correctly without per-component updates.
 *
 * @example
 * formatNumber(1234.5, { locale: "ko-KR" })        // "1,234.5"
 * formatNumber(85.567, { maximumFractionDigits: 1 }) // "85.6"
 * formatNumber(3.4, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) // "3.4"
 */
export function formatNumber(
  value: number,
  optionsOrLocale?: string | string[] | FormatNumberOptions
): string {
  if (typeof optionsOrLocale === "string" || Array.isArray(optionsOrLocale)) {
    // Legacy positional API: formatNumber(value, locale)
    return value.toLocaleString(optionsOrLocale);
  }
  const { locale = DEFAULT_LOCALE, minimumFractionDigits, maximumFractionDigits } = optionsOrLocale ?? {};
  return value.toLocaleString(locale, {
    ...(minimumFractionDigits != null ? { minimumFractionDigits } : {}),
    ...(maximumFractionDigits != null ? { maximumFractionDigits } : {}),
  });
}

/**
 * Format a byte count as a human-readable string with locale-aware digit grouping.
 *
 * Uses `formatNumber` internally so digit separators respect the user's locale.
 */
export function formatBytes(
  bytes: number,
  locale: string | string[] = DEFAULT_LOCALE
): string {
  if (bytes < 1024) return `${formatNumber(bytes, locale)} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(+(bytes / 1024).toFixed(1), locale)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${formatNumber(+(bytes / (1024 * 1024)).toFixed(1), locale)} MB`;
  return `${formatNumber(+(bytes / (1024 * 1024 * 1024)).toFixed(2), locale)} GB`;
}

/**
 * Format a difficulty score for display, stripping trailing zeros.
 *
 * Uses `formatNumber` internally so digit separators respect the user's
 * locale, then removes insignificant trailing zeros and the decimal point
 * if unnecessary.
 *
 * @example
 * formatDifficulty(1234.5)     // "1,234.5"  (en-US)
 * formatDifficulty(3)          // "3"
 * formatDifficulty(3.1)        // "3.1"
 * formatDifficulty(3.1, "ko-KR") // "3.1" (Korean grouping)
 */
export function formatDifficulty(
  value: number,
  locale: string | string[] = DEFAULT_LOCALE
): string {
  // Format with up to 2 decimal places, then strip trailing zeros after the
  // decimal point.  The negative lookbehind (?<=\.) ensures we only strip
  // digits after a decimal point, never the integer part itself (e.g. "0"
  // must remain "0", not become an empty string).
  return formatNumber(value, { locale, maximumFractionDigits: 2 })
    .replace(/(?<=\.)0+$/, "")   // strip trailing zeros after decimal point
    .replace(/\.$/, "");         // remove dangling decimal point
}

/**
 * Round a score value to two decimal places for display.
 * Returns "-" for null/undefined values.
 * Uses locale-aware digit grouping via formatNumber.
 */
export function formatScore(
  score: number | null | undefined,
  locale: string | string[] = DEFAULT_LOCALE
): string {
  if (score == null) return "-";
  return formatNumber(Math.round(score * 100) / 100, { locale, maximumFractionDigits: 2 });
}
