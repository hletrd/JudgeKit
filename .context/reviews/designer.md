# Designer (UI/UX) — RPF Cycle 5 (2026-06-11)

**HEAD:** 04b8c1ec. Static UI/UX review (code + catalogs). The browser-based
audit remains environment-blocked (DES-ENV: no provisioned login-capable
browser env from this runner — unchanged carry; findings below are all
text-evidence-backed from source).

## DES5-1 — Escalate flag renders as a raw i18n key path (HIGH visual defect, High, CONFIRMED)
`anti-cheat-dashboard.tsx:614` + filter dropdown `:498`, and the participant
timeline equivalent: a `submission_stale_heartbeat` event's type badge shows
the next-intl missing-message fallback (full key path) because neither
`messages/en.json` nor `messages/ko.json` defines
`contests.antiCheat.eventTypes.submission_stale_heartbeat` (verified
key-set). This is the exact row the integrity doc tells instructors to look
for. Fix: EN "Submission while monitor inactive" / KO "모니터 비활성 상태 제출"
(Korean default letter-spacing — no tracking utilities, per repo rule).

## DES5-2 — No severity color for the highest-severity event type (MEDIUM, High, CONFIRMED)
`EVENT_TYPE_COLORS` maps ip_change/code_similarity to red but lacks
`submission_stale_heartbeat` (both components) — the badge falls back to
plain secondary styling, visually QUIETER than a routine tab_switch (yellow).
Color must follow tier: add the red mapping in the shared presentation module
(A5-2). Both light and dark variants exist in the established pattern —
reuse `bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400`.

## DES5-3 — Flag details render as a JSON dump (LOW-MEDIUM, High, CONFIRMED)
`formatDetailsJson` humanizes only `target` payloads; a stale-flag's
`{latestEventAt, ageMs, thresholdMs}` (and, after G1, `submissionId`) prints
as pretty-printed JSON. Reviewers need "last monitor activity 4m 12s before
this submission (threshold 90s) — submission #…". Add a payload-shaped branch
with i18n in both locales.

## DES5-4 — Absence visibility (ties D5-3/IN5-2) (MEDIUM)
The participant timeline has no representation of "monitor went dark
12:04–12:31" or "dark since 12:40 (ongoing)". Render `heartbeatGaps` as a
compact list/banner above the event table; mark the ongoing gap distinctly
(destructive-tinted badge + relative time). Respect `prefers-reduced-motion`
(no pulsing animation; globals.css already neutralizes animations globally
under the media query — verified `:138-145`).

## DES5-5 — Verified-good (provenance)
- Korean letter-spacing rule: `globals.css:128-137` scopes the -0.01em body
  tracking behind `html:lang(ko) → normal`; not-found page and admin
  dashboard gate `tracking-*` on locale — compliant.
- Anti-cheat privacy dialog: non-dismissable with explicit accept, lists all
  four collection categories, `aria-hidden` decorative icon — good consent UX.
- Dashboard rows: `aria-expanded`/`aria-controls` on detail toggles ✓;
  countdown timer announces via `role="timer"` + escalating `aria-live`
  (polite→assertive when urgent) ✓ — DES3-1's politeness nuance remains a
  carried polish item, unchanged.
- Reduced-motion global kill-switch present ✓.

## Carried (unchanged)
DES3-1 (assertive announce on expired→active transition) — bundle with the
next exam-page a11y pass. DES-ENV (browser-run audit) — needs provisioned
staging + browser.
