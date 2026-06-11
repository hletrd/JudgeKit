# Designer — RPF Cycle 5/100

**Date:** 2026-04-26
**Lens:** UI/UX review of recent changes; web frontend exists (Next.js + Tailwind + shadcn UI)
**Method:** source-level review; no live runtime (Postgres + Docker not available in sandbox per cycle-3 history note)

---

## DES5-1: [LOW, actionable, NEW] AntiCheatDashboard "Filter chips + Student select" use `select-none` cursor-pointer Badges — keyboard / a11y concern

**Severity:** LOW
**Confidence:** MEDIUM

**Evidence:** `src/components/contest/anti-cheat-dashboard.tsx:436-454`
```tsx
<Badge
  variant={typeFilter === null ? "default" : "outline"}
  className="cursor-pointer select-none"
  onClick={() => setTypeFilter(null)}
>
  {t("allTypes")}
</Badge>
```
Badges are styled as buttons (`cursor-pointer`) but render as `<div>` (or whatever `Badge` renders). Likely:
- No `tabindex` → not keyboard-focusable.
- No `role="button"` → screen readers don't announce as actionable.
- No `aria-pressed` for toggle state.

**Why it's a problem:** WCAG 2.2 SC 2.1.1 (Keyboard) requires all interactive functionality to be keyboard-operable. Filter chips that fire `onClick` but are unreachable by keyboard violate this.

**Fix:** Either swap `Badge` for `Button variant="secondary" size="sm"` (which is already keyboard-accessible with proper roles) or wrap each Badge in a Button. With shadcn UI in this repo, `Button` is the right primitive.

**Exit criteria:**
- Filter chips are keyboard-focusable (Tab moves to them, Enter/Space activates).
- Screen readers announce the active filter state via `aria-pressed`.

---

## DES5-2: [LOW, deferred-carry] Privacy notice has no decline path (carried from DES3-1)

**Severity:** LOW
**Confidence:** HIGH

**Evidence:** `src/components/exam/anti-cheat-monitor.tsx:274-298`. Dialog with no close button (`showCloseButton={false}`) and `disablePointerDismissal`. Only one button: `privacyNoticeAccept`. The user CANNOT decline without leaving the page.

**Why deferring:** UX/legal judgment call (carried from cycle 3). Repo rules don't forbid deferring UX choices.

**Exit criterion for re-open:** Product/legal decides whether to add a "Decline → exit assignment" path.

---

## DES5-3: [LOW, NEW] Active filter chip color contrast not verified for dark mode

**Severity:** LOW
**Confidence:** LOW (no live runtime)

**Evidence:** `src/components/contest/anti-cheat-dashboard.tsx:75-89`
```ts
const EVENT_TYPE_COLORS: Record<string, string> = {
  tab_switch: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  ...
  ip_change: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};
```
Light mode `bg-yellow-100 text-yellow-800` likely passes WCAG AA (per Tailwind palette). Dark mode `dark:bg-yellow-900/30 dark:text-yellow-400` — the 30% alpha background on a dark surface MAY NOT meet AA 4.5:1 for normal text.

**Why it's a problem:** Anti-cheat events are review-critical UI — instructors need to read them quickly.

**Fix:** Verify with a contrast checker (Lighthouse / axe). If failing, increase dark-mode alpha to /50 or /60.

**Exit criterion for re-open:** Run a Playwright + axe pass once a sandbox with Postgres is available.

---

## Final Sweep

- The recently-touched UI surfaces (anti-cheat-monitor, anti-cheat-dashboard) have a few accessibility concerns but no regressions from cycle 4.
- The directive `user-injected/workspace-to-public-migration.md` (see CRIT5-2 / DOC5-1) needs freshness pass; the codebase has actually completed most of the migration.
- No live-runtime designer review possible (sandbox limitation per cycle-3 history).
- All gates green: lint, test:unit, build.
