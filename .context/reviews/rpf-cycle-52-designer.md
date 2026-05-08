# Cycle 52 — Designer

**Date:** 2026-04-23
**Base commit:** 1117564e
**Reviewer:** designer

## Inventory of Reviewed Files

- `src/components/exam/anti-cheat-monitor.tsx` (full)
- `src/components/exam/countdown-timer.tsx` (full)
- `src/components/contest/leaderboard-table.tsx` (reference)
- `src/components/contest/invite-participants.tsx` (reference)
- `src/components/contest/recruiting-invitations-panel.tsx` (reference)
- `src/components/layout/app-sidebar.tsx` (reference)
- `src/components/layout/active-timed-assignment-sidebar-panel.tsx` (reference)
- `src/components/problem/problem-submission-form.tsx` (reference)
- `src/components/seo/json-ld.tsx` (reference)
- `src/components/problem-description.tsx` (reference)

## Findings

No new UI/UX findings this cycle.

### Carry-Over Confirmations

- **DES-1:** Chat widget button badge lacks ARIA announcement (LOW/LOW) — deferred. Screen reader may not announce badge count.
- **DES-1 (cycle 46):** Contests page badge hardcoded colors (LOW/LOW) — deferred. Visual only; no accessibility impact.
- **DES-1 (cycle 48):** Anti-cheat privacy notice accessibility (LOW/LOW) — deferred. Requires manual keyboard testing; no code change identified yet.

### UI/UX Observations

1. The anti-cheat privacy notice dialog (`anti-cheat-monitor.tsx`) uses a `Dialog` component with `showCloseButton={false}` and an empty `onOpenChange` handler to prevent dismissal without acceptance. This is appropriate for a mandatory consent dialog. The dialog includes a `DialogDescription` which provides accessible context.

2. The countdown timer (`countdown-timer.tsx`) uses `Date.now()` for client-side time tracking, which is correct for client-side countdowns. The NTP-like offset calibration (lines 69-82) helps reduce server-client clock skew for contest timing.

3. The active timed assignment sidebar panel (`active-timed-assignment-sidebar-panel.tsx`) properly filters assignments by deadline and uses `setInterval` for periodic refresh — appropriate for a dashboard component.

4. The `problem-description.tsx` uses `dangerouslySetInnerHTML` with `sanitizeHtml()` — the sanitization is comprehensive with DOMPurify, strict tag/attribute allowlists, and URI scheme restrictions.

5. Korean text rendering: No `letter-spacing` or `tracking-*` Tailwind utilities were found applied to Korean content areas. The CLAUDE.md rule about preserving default Korean letter spacing is being followed.
