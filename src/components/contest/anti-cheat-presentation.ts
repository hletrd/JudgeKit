/**
 * Shared presentation constants + formatters for anti-cheat event rendering
 * (RPF cycle-5 AGG5-2 / A5-2).
 *
 * `anti-cheat-dashboard.tsx` and `participant-anti-cheat-timeline.tsx` each
 * carried their own copy of these maps and they had already drifted — both
 * copies were missing the `submission_stale_heartbeat` entry, so the
 * platform's most important escalate flag rendered as an unstyled badge with
 * a raw i18n key path. This module is the single source so the next event
 * type is added exactly once.
 *
 * The tier MODEL stays in `src/lib/anti-cheat/review-model.ts`; this module
 * owns only how tiers/types LOOK.
 */

export const EVENT_TYPE_COLORS: Record<string, string> = {
  // Context tier: ambient liveness, deliberately quiet.
  heartbeat: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  tab_switch: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  copy: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  paste: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  blur: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  contextmenu: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  ip_change: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  code_similarity: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  // Escalate tier (review-model.ts) — must read at least as loud as the
  // signal-tier types above (DES5-2).
  submission_stale_heartbeat: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export const REVIEW_TIER_COLORS: Record<string, string> = {
  context: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
  signal: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  escalate: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

/**
 * Loose view of a next-intl translator scoped to `contests.antiCheat`.
 * Both consumers pass their `useTranslations("contests.antiCheat")` result.
 */
export type AntiCheatTranslator = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

/**
 * Translated label for an event type. next-intl's `t()` NEVER returns
 * nullish for a missing message — it returns the (namespaced) key path — so
 * the old `t(...) ?? fallback` pattern was dead code and unknown types
 * rendered as raw key paths (CR5-2). Detect a miss by the returned string
 * ending with the requested key and fall back to the raw event type.
 */
export function antiCheatEventTypeLabel(eventType: string, t: AntiCheatTranslator): string {
  const key = `eventTypes.${eventType}`;
  const label = t(key);
  return label.endsWith(key) ? eventType : label;
}

function formatMsDuration(ms: number, t: AntiCheatTranslator): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0
    ? t("durationMinutesSeconds", { minutes, seconds })
    : t("durationSeconds", { seconds });
}

/**
 * Human-readable rendering of an event's `details` JSON payload.
 *  - `{ target }` (copy/paste events): translated target summary.
 *  - `{ latestEventAt, ageMs, thresholdMs, submissionId? }`
 *    (submission_stale_heartbeat): reviewer-facing sentence + submission
 *    reference instead of a raw JSON dump (DES5-3).
 *  - anything else: pretty-printed JSON; unparseable input verbatim.
 */
export function formatAntiCheatDetails(raw: string, t: AntiCheatTranslator): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;

      if (typeof record.thresholdMs === "number") {
        const threshold = formatMsDuration(record.thresholdMs, t);
        const lines: string[] = [
          typeof record.ageMs === "number"
            ? t("detailStaleWithAge", { age: formatMsDuration(record.ageMs, t), threshold })
            : t("detailStaleNoActivity", { threshold }),
        ];
        if (typeof record.submissionId === "string" && record.submissionId.length > 0) {
          lines.push(t("detailSubmissionRef", { id: record.submissionId }));
        }
        return lines.join("\n");
      }

      if (typeof record.target === "string") {
        const targetKey = `detailTargets.${record.target}`;
        const label = t(targetKey);
        const resolved = label.endsWith(targetKey) ? record.target : label;
        return `${t("detailTargetLabel")}: ${resolved}`;
      }
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}
