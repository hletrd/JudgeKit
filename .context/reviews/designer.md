# Designer Review - Cycle 1/100

Repo: `/Users/hletrd/flash-shared/judgekit`
Role: DESIGNER reviewer
Date: 2026-06-30

## Inventory First

Reviewed UI/documentation surfaces before filing findings:

- App Router pages and layouts: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/(public)/**`, `src/app/(auth)/**`, `src/app/(dashboard)/**`, route-level `loading.tsx`, `error.tsx`, `not-found.tsx`.
- Shared UI primitives: `src/components/ui/**` including button, input, checkbox, dialog, alert-dialog, select, dropdown-menu, sheet, table, tabs, tooltip, toast.
- Layout/navigation: `src/components/layout/**`, `src/lib/navigation/public-nav.ts`, `src/lib/navigation/admin-nav.ts`, locale and theme controls.
- Feature UI: problem creation/submission, code editor, contest creation/recruiting, groups/assignments, admin API keys/files/settings/tags/languages, rankings, submissions, discussions.
- Styles/theme: `src/app/globals.css`, Tailwind utility usage in representative routes/components.
- i18n/locale: `messages/en.json`, `messages/ko.json`, `src/i18n/**`, `src/lib/i18n.ts`, locale-aware labels and Korean letter-spacing rules.
- Project docs relevant to UI: `AGENTS.md`, `CLAUDE.md`, `.context/development/problem-descriptions.md` where reachable.

Live browser automation was attempted but blocked by local server/runtime state:

- `npm run dev -- --hostname 127.0.0.1 --port 3100` did not bind a reachable port; `curl` failed with connection refused.
- `npm run start -- -H 127.0.0.1 -p 3100` started Next.js 16.2.9 but timed out without returning headers. It also warned that `next start` does not work with `output: "standalone"`.
- `node .next/standalone/server.js` failed because `.next/standalone/server.js` is absent in the current workspace artifact.

Because no reliable HTTP page was reachable, this review falls back to DOM/source evidence. I did not edit product code.

## Findings

### D1. Multiple visible form controls have no programmatic label

Severity: High
Confidence: High

Evidence:

- `src/components/contest/quick-create-contest-form.tsx:105-174`
  - title input and description textarea use placeholders only
  - duration input has no `id`, `htmlFor`, or accessible name
  - anti-cheat checkbox is paired with adjacent text but not a label
  - repeated problem selects and points inputs have no accessible names
- `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:429-453`, `461-469`, `477-523`, `632-650`
  - exam mode, duration, visibility, scoring, freeze time, and problem-row controls are visually labelled but not reliably associated with controls
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:391-429`
  - API key name input is placeholder-only; role and expiry selects are not associated with labels
- `src/components/contest/recruiting-invitations-panel.tsx:456-485`, `501-523`
  - candidate name/email and metadata key/value inputs are placeholder-only; expiry select is not labelled
- `src/app/(dashboard)/dashboard/admin/settings/home-page-content-form.tsx:128-168`
  - locale fields and card title/description inputs have labels that are not associated or rely on placeholders
- `src/app/(dashboard)/dashboard/admin/settings/footer-content-form.tsx:140-163`
  - copyright and footer-link fields are not consistently associated with labels

Failure scenario:

A screen-reader user opens the quick contest creator and tabs through the form. The assistive technology announces generic controls such as "edit text blank", "spin button 60", "checkbox checked", and "button" without the visible purpose. A speech-input user also cannot target controls by their visible names because the accessible names are missing.

Suggested fix:

Add stable `id` values and matching `Label htmlFor` for every input/textarea/select trigger. For custom select triggers, pass `id` to the trigger and use `aria-labelledby` when needed. Wrap checkbox text in a real `<label>` or use `id`/`htmlFor`. Label repeated row controls with indexed names such as "Problem 1", "Problem 1 points". Keep placeholders as examples only, not as labels.

### D2. Base dialogs can trap keyboard users in off-screen content on small viewports

Severity: Medium
Confidence: High

Evidence:

- `src/components/ui/dialog.tsx:56-60`
  - `DialogContent` is fixed and centered, but the base component does not provide `max-h` or `overflow-y-auto`.
- `src/components/ui/alert-dialog.tsx:49-53`
  - `AlertDialogContent` has the same issue.
- Plain call sites inherit this unsafe default, for example:
  - `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:384-440`
  - `src/components/contest/recruiting-invitations-panel.tsx:449-554`

Failure scenario:

On a 320x568 mobile viewport, the API-key dialog or recruiting invitation dialog can exceed the visible height. Because the dialog focus trap keeps focus inside the modal while the base content area is not scrollable, lower fields and the footer action can become unreachable or very hard to reach by keyboard and touch.

Suggested fix:

Give the base dialog content a safe default such as `max-h-[calc(100dvh-2rem)] overflow-y-auto`, with footer sections kept visible where appropriate. Keep per-dialog overrides for specialized layouts, but make the primitive safe by default. Apply the same treatment to alert dialogs.

### D3. Lecture-mode menu toggle is an unnamed, undersized interactive control

Severity: Medium
Confidence: High

Evidence:

- `src/components/layout/lecture-mode-toggle.tsx:68-84`
  - the visual switch is a nested `<button>` with no `aria-label`, no visible text, no `aria-pressed`, and no `role="switch"`/`aria-checked`.
  - the hit target is `h-5 w-9`, below the WCAG 2.2 target-size baseline unless a spacing exception clearly applies.

Failure scenario:

A screen-reader user opens the lecture-mode menu and lands on an unnamed button. They cannot tell what it controls or whether it is on. A touch user on mobile has to hit a 20px-tall target inside a dropdown row, increasing miss taps.

Suggested fix:

Use the existing switch/checkbox pattern or expose the button as `role="switch" aria-checked={active}` with an accessible name such as `aria-label={t("lectureMode")}`. Add a visible or `sr-only` label for state, increase the target to at least 24px, and avoid placing an interactive button inside a non-interactive menu label container.

### D4. Quick-create contest layout is not responsive enough for narrow screens

Severity: Medium
Confidence: High

Evidence:

- `src/components/contest/quick-create-contest-form.tsx:124-148`
  - the settings area is always `grid-cols-2`, with no `sm:` breakpoint.
- `src/components/contest/quick-create-contest-form.tsx:151-179`
  - selected problem rows use a single no-wrap flex row containing a select, points input, "pts" text, and remove button.

Failure scenario:

On a 320px or 360px mobile viewport inside a card, the duration and anti-cheat controls compete for half-width columns, while the problem rows squeeze a select and fixed-width points input into one line. Labels and values become cramped, and touch targets cluster tightly.

Suggested fix:

Use `grid-cols-1 sm:grid-cols-2` for the settings block. For problem rows, switch to a mobile-first stacked/grid layout with a full-width problem select and separate points/remove controls, then use a denser inline layout at `sm` or `md`. This also gives room to add the missing accessible labels from D1.

### D5. Public tag badges can fail color contrast when admins choose custom colors

Severity: Medium
Confidence: High

Evidence:

- `src/app/(public)/problems/page.tsx:710-714`
  - tag badges set text `color` and `borderColor` directly from `tag.color`.
- `src/app/(dashboard)/dashboard/admin/tags/tag-form-fields.tsx:37-40`
  - admins can enter any valid hex color. The palette and custom entry path do not enforce contrast.

Failure scenario:

An admin enters a light color such as `#F5F5F5` or a saturated yellow. On the public problems page the badge text uses that color directly on a light background, producing unreadable text and failing WCAG contrast. The inverse can also happen in dark mode with saturated/dim colors.

Suggested fix:

Do not use arbitrary tag colors as text color. Render the custom color as a dot, left border, or background accent while text stays on theme tokens. If colored text is required, compute contrast against the current background and choose a compliant foreground/background pair. Add a contrast preview or validation warning to the admin tag form.

### D6. Horizontal table scroll regions are not keyboard reachable or announced

Severity: Medium
Confidence: Medium-High

Evidence:

- `src/components/ui/table.tsx:7-18`
  - the shared table wrapper uses `overflow-x-auto` but has no `tabIndex`, accessible name, or focus style.
- Page-level table wrappers repeat the same pattern, for example:
  - `src/app/(public)/problems/page.tsx:670-756`
  - `src/app/(public)/submissions/page.tsx:460-527`
  - `src/app/(public)/rankings/page.tsx:266-315`
  - `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:138-230`

Failure scenario:

On narrow screens, right-side columns and row actions move outside the visible area. Mouse/touch users can pan the scroll container, but keyboard-only users cannot focus the horizontal scroll region to scroll it with arrow keys. Screen-reader users are also not told that the region is horizontally scrollable.

Suggested fix:

Make horizontal scroll wrappers focusable with `tabIndex={0}`, give them `aria-label` or `aria-labelledby`, and add a visible focus ring. For high-value tables with actions, consider a responsive card/list alternative instead of relying only on horizontal scrolling.

### D7. Admin file-management row checkboxes have no accessible names

Severity: Medium
Confidence: High

Evidence:

- `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:142-146`
  - select-all checkbox has no accessible label.
- `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:160-164`
  - per-row checkbox has no accessible label tied to the file name.

Failure scenario:

A screen-reader user navigating the file table hears repeated "checkbox not checked" controls with no indication of whether the checkbox selects all files or a specific file. Because the checkbox itself is visually only `size-4`, users with motor impairments also have a small target unless the surrounding row is made label-clickable.

Suggested fix:

Add `aria-label={t("selectAllFiles")}` to the header checkbox. Add per-row labels such as `aria-label={t("selectFile", { name: file.originalName })}` or visually hidden labels. Consider making the file-name cell or row selection area part of the clickable label.

### D8. Problem-create tag picker is not exposed as a labelled combobox/listbox

Severity: Medium
Confidence: High

Evidence:

- `src/app/(public)/problems/create/create-problem-form.tsx:675-704`
  - the visible "tags" label is not associated with the tag input; the input has no `id` or accessible name.
- `src/app/(public)/problems/create/create-problem-form.tsx:680-686`
  - selected tag remove buttons have no `aria-label`.
- `src/app/(public)/problems/create/create-problem-form.tsx:706-727`
  - suggestions are rendered as a generic list of buttons, not as a combobox/listbox pattern with expanded state and active option semantics.

Failure scenario:

A screen-reader user reaches an unlabeled edit field, types a tag, then hears a group of generic buttons. They cannot reliably tell which tag will be removed or how suggestions relate to the input. Keyboard users may not get the expected combobox behavior of arrowing through suggestions with an announced active option.

Suggested fix:

Associate the input with the tags label via `id`/`htmlFor` or `aria-labelledby`. Add remove labels such as `aria-label={t("removeTag", { tag: tag.name })}`. Model suggestions as a combobox/listbox (`aria-expanded`, `aria-controls`, `role="listbox"`, `role="option"`, `aria-activedescendant`) or use an established accessible combobox primitive.

### D9. Homepage first paint waits on dashboard-like metrics

Severity: Low
Confidence: Medium

Evidence:

- `src/app/page.tsx:49-65`
  - the homepage awaits `getServerSession()`, `getHomepageInsights()`, and `getJudgeSystemSnapshot()` together before rendering `PublicHomePage`.
- `src/app/(public)/_components/public-home-page.tsx:19-134`
  - hero content and below-the-fold metrics are coupled through the same page render.

Failure scenario:

If the judge snapshot or database-backed insight query is slow, anonymous visitors wait for non-critical metrics before seeing the public homepage shell. This hurts perceived performance even though the hero copy and navigation can render without those metrics.

Suggested fix:

Render the hero and primary navigation from cached/static content first. Move insights and judge status into separate server components behind `Suspense` with skeletons or cached revalidation. Keep authenticated redirect/session logic separate from metric fetching where practical.

## Coverage Notes

- Information architecture: reviewed public navigation, dashboard navigation, breadcrumbs, legacy redirects, and auth-vs-public layouts. The centralized nav configuration is a strength; no IA-blocking finding was found beyond the mobile/table/dialog issues above.
- Affordances: reviewed buttons, icons, dropdowns, destructive actions, build/remove controls, tag controls, and row actions. The strongest affordance gaps are missing labels and tiny unnamed toggles.
- Focus and keyboard: reviewed skip links, header mobile focus trap, dialog/sheet behavior, code editor Escape handling, tab controls, table scroll, and modal overflow.
- WCAG 2.2 accessibility: reviewed accessible names, target size, color contrast, focus visibility, reduced motion, labels/instructions, and modal reachability.
- Responsive breakpoints: reviewed public lists, forms, dashboards, cards, tables, dialogs, and quick-create flows. D2, D4, and D6 are the main responsive risks.
- Loading/empty/error states: reviewed route-level `loading.tsx`/`error.tsx`/`not-found.tsx`, table empty states, form errors, toasts, and skeleton usage. No broader blocker found, though some form errors should be wired to fields when D1 is fixed.
- Dark/light mode: reviewed theme tokens in `globals.css`, `ThemeProvider`, and representative components. D5 is the main dark/light risk because custom tag colors bypass tokens.
- i18n/RTL: compared `messages/en.json` and `messages/ko.json`; both currently have the same 2981 leaf keys. The root layout sets `lang`; no `dir` issue is user-visible for the current LTR-only locale set (`en`, `ko`). Korean letter-spacing overrides are present in `globals.css`.
- Perceived performance: reviewed dynamic code editor loading, route loading states, and homepage data dependencies. D9 is the main perceived performance issue.

Final sweep note: I inventoried and sampled all relevant UI file classes for this Next.js frontend: app-router pages/layouts, shared primitives, layout/nav, feature components, admin screens, auth forms, styles/theme, i18n messages/config, and UI-relevant docs. No relevant UI file class was skipped; live browser evidence was skipped only because the local server artifact was not runnable as documented above.
