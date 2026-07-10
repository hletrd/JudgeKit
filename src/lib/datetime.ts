const DEFAULT_LOCALE = "en";

export const DEFAULT_TIME_ZONE = "Asia/Seoul";

function normalizeDate(value: number | string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function formatWithOptions(
  value: number | string | Date,
  locale: string | string[] = DEFAULT_LOCALE,
  timeZone = DEFAULT_TIME_ZONE,
  options: Intl.DateTimeFormatOptions
) {
  const date = normalizeDate(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    ...options,
  }).format(date);
}

export function formatDateTimeInTimeZone(
  value: number | string | Date,
  locale: string | string[] = DEFAULT_LOCALE,
  timeZone = DEFAULT_TIME_ZONE
) {
  return formatWithOptions(value, locale, timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

export function formatDateInTimeZone(
  value: number | string | Date,
  locale: string | string[] = DEFAULT_LOCALE,
  timeZone = DEFAULT_TIME_ZONE
) {
  return formatWithOptions(value, locale, timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatRelativeTimeFromNow(
  value: number | string | Date,
  locale: string | string[] = DEFAULT_LOCALE,
  now = Date.now()
) {
  const date = normalizeDate(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const diffMs = date.getTime() - now;
  const diffSeconds = Math.round(diffMs / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (Math.abs(diffSeconds) < 60) {
    return formatter.format(diffSeconds, "second");
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
}

/**
 * Milliseconds the given IANA zone's wall clock is ahead of UTC at instant
 * `at`. Computed via Intl (no dependency): render the instant's wall-clock
 * fields in the zone, reinterpret them as UTC, and diff.
 */
function timeZoneOffsetMs(timeZone: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(at / 1000) * 1000;
}

/**
 * Format an epoch-ms value as a `datetime-local` input string
 * ("YYYY-MM-DDTHH:mm") showing the wall-clock time in the given IANA zone.
 *
 * Forms editing deadlines must use the SYSTEM timezone (useSystemTimezone()),
 * not the browser's: every read-only deadline display renders in the system
 * zone, so a browser-local form silently shifts the stored instant by the
 * offset difference when an instructor edits from another timezone.
 */
export function formatDateTimeLocalInput(
  value: number | null,
  timeZone: string,
): string {
  if (!value || Number.isNaN(value)) {
    return "";
  }
  const shifted = new Date(value + timeZoneOffsetMs(timeZone, value));
  return shifted.toISOString().slice(0, 16);
}

/**
 * Parse a `datetime-local` input string as wall-clock time in the given IANA
 * zone, returning epoch ms (or null for empty/invalid input). Two-pass offset
 * resolution handles DST boundaries where the offset depends on the instant.
 */
export function parseDateTimeLocalInput(
  value: string,
  timeZone: string,
): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return null;
  }
  const [, y, mo, d, h, mi, s] = match;
  const naiveUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? 0),
  );
  if (Number.isNaN(naiveUtc)) {
    return null;
  }
  const guess = naiveUtc - timeZoneOffsetMs(timeZone, naiveUtc);
  return naiveUtc - timeZoneOffsetMs(timeZone, guess);
}
