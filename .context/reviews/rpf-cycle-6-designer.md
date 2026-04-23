# Designer — RPF Cycle 6

## Scope
UI/UX review of recently changed files. This repo has a Next.js frontend with shadcn/ui components.

## Findings

### DES-1: `recruiting-invitations-panel.tsx` — Email field incorrectly required in Create dialog
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/contest/recruiting-invitations-panel.tsx:484`
- **Problem:** The Create button is `disabled={creating || !createName.trim() || !createEmail.trim()}`. This forces users to enter an email even though the API treats it as optional. This is a UX regression — invitations should be creatable with just a name.
- **Fix:** Remove `!createEmail.trim()` from the disabled condition.

### DES-2: `recruiting-invitations-panel.tsx` — No loading indicator after Create button is clicked
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/contest/recruiting-invitations-panel.tsx:484-487`
- **Problem:** The Create button text doesn't change to "Creating..." when `creating` is true. The button is disabled, but there's no visual feedback that the creation is in progress.
- **Fix:** Add a loading state: `{creating ? tCommon("loading") : t("create")}`.

### DES-3: `anti-cheat-dashboard.tsx` — Data disappears during polling (confirms CRIT-2)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Problem:** When the 30-second poll fires, loaded events are replaced with only the first page. Users see a flash where their expanded data disappears and reappears. This breaks the principle of data stability — users should not see their content change unexpectedly.
- **Fix:** Implement smarter polling that preserves loaded data.

### DES-4: `score-timeline-chart.tsx` — SVG chart lacks keyboard interaction for data points
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/contest/score-timeline-chart.tsx:84-93`
- **Problem:** The SVG data point circles (`<circle>`) have `<title>` for tooltips but are not keyboard-focusable. Adding `tabIndex={0}` and `role="img"` to each `<g>` element would improve accessibility.
- **Fix:** Add `tabIndex={0}` and `role="img"` to the `<g>` wrapper, with an `aria-label` including the score.

### DES-5: `countdown-timer.tsx` — Uses `aria-live="assertive"` for threshold announcements
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/components/exam/countdown-timer.tsx:151-153`
- **Problem:** `aria-live="assertive"` immediately interrupts screen readers. For time warnings during exams, "polite" might be more appropriate to avoid interrupting ongoing speech. However, given that exam time warnings are critical, "assertive" is arguably correct. This is a judgment call.
