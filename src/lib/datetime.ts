const DEFAULT_LOCALE = "en-US";

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
