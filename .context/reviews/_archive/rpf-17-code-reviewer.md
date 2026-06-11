# RPF Cycle 17 — Code Reviewer Report

**Date:** 2026-04-20
**Reviewer:** code-reviewer
**Base commit:** HEAD (2af713d3)
**Scope:** Full repository, focus on timezone consistency, locale handling, and recent changes

---

## CR-1: Workers page `formatRelativeTime` uses hardcoded English strings instead of locale-aware utility [MEDIUM/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:85-95`
**Description:** The `formatRelativeTime` function computes relative time strings like "5m ago", "2h ago" using hardcoded English. The app already has `formatRelativeTimeFromNow()` in `src/lib/datetime.ts` which uses `Intl.RelativeTimeFormat` with proper locale support.

**Concrete failure scenario:** Korean users see "5m ago" instead of "5분 전" in the workers admin table.
**Fix:** Replace the local `formatRelativeTime` function with `formatRelativeTimeFromNow` from `@/lib/datetime`, passing the locale.
**Confidence:** MEDIUM

---

## CR-2: Anti-cheat timeline and dashboard use `toLocaleString(locale)` without timezone [MEDIUM/MEDIUM]

**Files:**
- `src/components/contest/participant-anti-cheat-timeline.tsx:150`
- `src/components/contest/anti-cheat-dashboard.tsx:257`

**Description:** Both components use `d.toLocaleString(locale)` without specifying a `timeZone` option. The rest of the app consistently uses `formatDateTimeInTimeZone()` which applies the system-configured timezone (defaulting to `Asia/Seoul`). Anti-cheat event timestamps may display in the user's browser timezone while all other timestamps in the app use the configured timezone.

**Concrete failure scenario:** A contest in Seoul (UTC+9) shows anti-cheat events in a different timezone for a proctor in a different TZ, causing confusion about when events occurred relative to the contest timeline.
**Fix:** Use `formatDateTimeInTimeZone(dateStr, locale, timeZone)` — the component needs to receive the system timezone or read it from context.
**Confidence:** MEDIUM

---

## CR-3: Code timeline panel `toLocaleTimeString` without timezone [MEDIUM/MEDIUM]

**Files:** `src/components/contest/code-timeline-panel.tsx:76-80`
**Description:** Same timezone consistency issue as CR-2. Uses `new Date(dateStr).toLocaleTimeString(locale, { ... })` without specifying `timeZone`.

**Fix:** Use `formatDateTimeInTimeZone` or at minimum pass the `timeZone` option.
**Confidence:** MEDIUM

---

## CR-4: Chat logs client `toLocaleString` without timezone [MEDIUM/MEDIUM]

**Files:**
- `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:111`
- `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:155`

**Description:** Same timezone consistency issue. Uses `toLocaleString(locale)` without timezone.

**Fix:** Use `formatDateTimeInTimeZone` with the system timezone.
**Confidence:** MEDIUM

---

## CR-5: Public problem detail page `toLocaleDateString` for editorial date [LOW/MEDIUM]

**Files:** `src/app/(public)/practice/problems/[id]/page.tsx:555`
**Description:** Uses `new Date(editorial.createdAt).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })` without timezone. This is a server-rendered page that already imports `formatDateTimeInTimeZone` (line 19) and has the `timeZone` variable (line 126). The editorial date should use the same formatting convention as the rest of the page.

**Fix:** Replace with `formatDateInTimeZone(editorial.createdAt, locale, timeZone)`.
**Confidence:** MEDIUM

---

## CR-6: Practice page `toLocaleDateString` for problem creation date [LOW/MEDIUM]

**Files:** `src/app/(public)/practice/page.tsx:697`
**Description:** Uses `problem.createdAt.toLocaleDateString(locale, ...)` without timezone. Same consistency issue as CR-5.

**Fix:** Use `formatDateInTimeZone` with the system timezone.
**Confidence:** MEDIUM

---

## CR-7: API keys client `toLocaleDateString` without timezone [LOW/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:284`
**Description:** Uses `new Date(dateStr).toLocaleDateString(locale, { ... })` without timezone.

**Fix:** Pass `timeZone` option or use `formatDateInTimeZone`.
**Confidence:** MEDIUM

---

## CR-8: `formatNumber` in submission-status-badge hardcodes "en-US" locale [LOW/LOW]

**Files:** `src/components/submission-status-badge.tsx:44-46`
**Description:** `n.toLocaleString("en-US")` hardcodes the locale for numeric formatting. While arguably acceptable for technical data (e.g., "1,234 ms"), it creates inconsistency when the rest of the app is locale-aware. Some locales use different digit grouping (e.g., "1.234" in German).

**Fix:** Low priority. Consider using `Intl.NumberFormat` with the current locale.
**Confidence:** LOW

---

## Verified Safe

- `dangerouslySetInnerHTML` uses are properly sanitized:
  - `json-ld.tsx` uses `safeJsonForScript()` which escapes `</script` sequences
  - `problem-description.tsx` uses `sanitizeHtml()` for legacy HTML content
- No `@ts-ignore`, `@ts-expect-error`, or `as any` found in src/
- Only 2 `eslint-disable` directives, both with justification comments
- Korean letter-spacing handling is comprehensive and correct throughout
- `getDbNow()` is properly used in recruit page for clock-skew prevention
- Clipboard error handling is properly implemented across all components
- Timer cleanup refs are properly used across components
- `sign-out.ts` `APP_STORAGE_PREFIXES` now correctly includes all prefixes (`oj:`, `judgekit_anticheat_`, `compiler:`)
