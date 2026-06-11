# Designer — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f. **Method:** static UI/UX + WCAG 2.2 audit of the cycle-5 UI surface (anti-cheat dashboard, participant timeline, monitor privacy dialog) via DOM-structure analysis of the TSX and the design-system primitives. Live-browser audit remains environment-gated (no provisioned login-capable browser session from this runner — DEFER-ENV-GATES, unchanged); all findings below are text-evidence-backed with selectors and exact classes.

## Findings

### DES6-1 — Anti-cheat filter chips are mouse-only controls (MEDIUM a11y, High, CONFIRMED — WCAG 2.1.1, 4.1.2)
`anti-cheat-dashboard.tsx:459-475` and `participant-anti-cheat-timeline.tsx:251-269`: filter chips are `Badge` (renders a `<span>` — `ui/badge.tsx:33-40`) with `onClick` + `cursor-pointer` but no `role`, no `tabIndex`, no key handling, no pressed-state semantics. Keyboard and AT users cannot operate event-type filtering at all on either proctoring view. Fix: render each chip as a real `<button type="button">` (Badge supports the base-ui `render` prop) with `aria-pressed={active}`; focus styling already exists in the badge variants (`focus-visible:ring-…`), so the visual cost is zero.

### DES6-2 — Active-chip state is conveyed by variant color alone (LOW, Medium — WCAG 1.4.1)
Selected chip switches `outline`→`default` variant only. With `aria-pressed` (DES6-1) the programmatic state is fixed; consider an inline check glyph for low-vision users if chips grow in number. No action required beyond DES6-1 this cycle.

## Verified-good on the cycle-5 surface
- **Heartbeat-gaps card** (`participant-anti-cheat-timeline.tsx:218-247`): `role="region"` + `aria-label`, text labels alongside the red border (not color-only), `ongoing` conveyed by a text badge, durations humanized via i18n plurals, no motion (reduced-motion safe).
- **Details expanders**: real `<button>` with `aria-expanded` + `aria-controls` wired to the `pre` id — correct disclosure pattern in both views.
- **Privacy notice dialog** (`anti-cheat-monitor.tsx:371-407`): modal, non-dismissable with explicit accept, decorative icon `aria-hidden`, list semantics for recorded-signal items. Session-scoped acceptance is a sensible privacy/UX tradeoff (re-notice per tab).
- **Escalate-flag legibility** (cycle-5 G2) holds: red tier color + translated label + humanized details replace the raw JSON dump; en/ko parity confirmed.
- **Korean typography rule**: no `tracking-*` on Korean-bearing text; all heading tracking utilities are locale-gated (`locale !== "ko"`).

## Carried (register unchanged)
- DES3-1 — expired→active deadline announcement politeness (`exam-deadline-sync.tsx:107`) — bundle with the next exam-page a11y pass.
- DES-ENV — full keyboard/contrast browser audit needs the provisioned staging session (DEFER-ENV-GATES).

## Final sweep
Loading skeletons, empty states ("noEvents"/"noEventsForFilter"), and error+retry states all present in both views; `Load more` buttons disable while pending — no spinner-trap. No new dark-mode contrast regressions detectable from class analysis (slate/amber/red pairs match the existing approved palette).
