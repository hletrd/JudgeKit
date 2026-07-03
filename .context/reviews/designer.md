# Cycle 4 UI/UX Review — JudgeKit Next.js Frontend

**Review date:** 2026-07-03  
**Scope:** `src/app/**/*.tsx`, `src/components/**/*.tsx`, `src/lib/plugins/**/*.tsx`, `src/app/globals.css`, `next.config.ts`, `components.json`, i18n messages (`messages/en.json`, `messages/ko.json`), public assets.  
**Method:** Static code analysis plus a dev-server run against the local `judgekit-postgres` container, with `agent-browser` accessibility snapshots of the home, login, practice, problem detail, and playground pages. Admin/dashboard pages were inspected in source because local seed credentials did not match the current database.

---

## Summary

JudgeKit's UI remains well-architected: Tailwind v4 CSS variables support light/dark/lecture modes, Korean typography is guarded behind locale checks, and landmarks/skip-links are present on public pages. Browser inspection confirmed that most form labels on public pages are programmatically associated and that the mobile navigation has a working focus trap.

The most important remaining risks are the same as Cycle 3, indicating they were not remediated between reviews:

1. **`<SelectValue />` is left empty in several selects**, violating the project's own rule and displaying raw option values.
2. **Many `<Label>` components are not associated with their controls** (no `htmlFor`, no wrapping), breaking screen-reader efficiency and click-to-focus behavior.
3. **`<Link>` elements wrap `<Button>` components** in multiple public pages, producing invalid nested interactive controls.
4. **Tablists and some comboboxes lack accessible names**, so screen-reader users cannot distinguish multiple tab groups or identify the playground language selector.
5. **Custom interactive elements omit visible focus indicators**, making keyboard navigation difficult.

No finding renders the app unusable, but the first three directly violate in-project conventions and WCAG 2.2 requirements and should be fixed before the next deploy.

---

## UI Inventory Reviewed

- **Routes / layouts:** `src/app/layout.tsx`, `src/app/(public)/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/(auth)/layout.tsx`, all reachable `loading.tsx`, `error.tsx`, and `not-found.tsx` pages.
- **Global styles:** `src/app/globals.css` (theme tokens, Korean letter-spacing overrides, `prefers-reduced-motion` media query, lecture-mode themes, problem-description typography).
- **Design system:** `src/components/ui/*` (Button, Input, Textarea, Select, Dialog, AlertDialog, Sheet, DropdownMenu, Checkbox, Label, Badge, Skeleton, Table, Tabs, Sonner, Tooltip, Combobox, etc.).
- **Layout components:** Public header/footer, dashboard breadcrumb header, skip-to-content, theme/locale/lecture toggles.
- **Feature surfaces:** Problem create/edit, submission form, compiler/playground, contest management, anti-cheat dashboard, recruiting invitations, groups, file management, admin settings, chat widget.
- **Assets:** `public/`, `static-site/nginx.conf`.

---

## Findings

### 1. Empty `<SelectValue />` shows raw option values

- **Severity:** HIGH  
- **Confidence:** High  
- **Files & regions:**
  - `src/app/(public)/groups/[id]/assignments/[assignmentId]/filter-form.tsx:81`
  - `src/components/problem/accepted-solutions.tsx:121` and `:136`
  - `src/components/contest/score-timeline-chart.tsx:66`
  - `src/components/contest/contest-replay.tsx:222`
  - `src/components/contest/contest-clarifications.tsx:203`
  - `src/components/contest/anti-cheat-dashboard.tsx:504`
- **Problem:** `AGENTS.md` forbids `<SelectValue />` without static children because `@base-ui/react/select` falls back to rendering the raw `value` string. In each of these triggers the value is empty, so users see raw IDs, status keys, `all`, or `general` instead of localized labels.
- **Failure scenario:** A student opens the assignment status filter and sees `all` / `accepted` / `rejected` raw keys; an admin sees a raw nanoid in a participant selector.
- **Fix:** Use the project pattern `<SelectValue>{labelMap[stateVar] ?? stateVar}</SelectValue>` in every trigger. For pick-to-add selects, force a remount with `key` after selection so the label updates.

### 2. Form labels not associated with their controls

- **Severity:** HIGH  
- **Confidence:** High  
- **Files & regions (representative list):**
  - `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:429`, `:461`, `:477`, `:497`, `:517`, `:632`
  - `src/app/(public)/groups/edit-group-dialog.tsx:138`
  - `src/app/(public)/profile/page.tsx:83`
  - `src/app/(public)/problems/create/create-problem-form.tsx:675`
  - `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:387`, `:408`
  - `src/app/(dashboard)/dashboard/admin/settings/home-page-content-form.tsx:129`, `:137`, `:145`
  - `src/app/(dashboard)/dashboard/admin/settings/footer-content-form.tsx:140`, `:149`
  - `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:196`
  - `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:391`, `:399`, `:418`
  - `src/app/(dashboard)/dashboard/admin/tags/tag-form-fields.tsx:54`
  - `src/components/problem/function-reference-solution.tsx:156`
  - `src/components/problem/function-signature-builder.tsx:162`, `:264`
  - `src/components/contest/recruiting-invitations-panel.tsx:456`, `:464`, `:473`, `:501`
  - `src/components/contest/contest-replay.tsx:213`
- **Problem:** The project `Label` component renders a plain `<label>`. When it is used as a sibling of an `<Input>`/`<Select>`/`<Textarea>` without `htmlFor` and without wrapping the control, there is no programmatic association. Clicking the label does not focus the field, and screen readers may not reliably announce the label when the user tabs to the control.
- **Failure scenario:** A keyboard user tabs to the "Exam mode" field in the assignment form; the screen reader only reads the placeholder/value, not the label. A mouse user clicks "Capabilities" in the role editor and the checkbox list does not receive focus.
- **Fix:** Add matching `id` props to every input/select/textarea and `htmlFor` to their `Label`s. Where the label text is a section heading (e.g., "SMTP settings"), wrap the controls in `<fieldset>/<legend>` or use `aria-labelledby` instead.

### 3. `<Link>` elements wrapping `<Button>` create invalid interactive nesting

- **Severity:** MEDIUM  
- **Confidence:** High  
- **Files & regions (verified in browser):**
  - `src/app/(public)/practice/page.tsx` — the "Reset" link contains a `<Button>`.
  - `src/app/(public)/practice/problems/[id]/page.tsx:548-590` — "Submit solution", "Edit problem", "Try in playground", "Sign in to submit", and "Rankings" are all `<Link>` elements containing `<Button>` children.
  - `src/app/(public)/dashboard/_components/dashboard-judge-system-tabs.tsx:99-100` — "View all languages" is a `<Link>` containing a `<Button>`.
- **Problem:** HTML does not allow interactive content inside a link. The accessibility tree exposes a link with a nested button, which screen readers may ignore or misreport, and keyboard activation can behave inconsistently.
- **Failure scenario:** A screen-reader user tabs to "Try in playground" and hears a link that contains a button; activating it may not follow the link reliably.
- **Fix:** Use a plain styled `<Link>` without an inner `<Button>`, or use a `<Button asChild>` pattern so only one focusable element is rendered. For the "Reset" action, either style the link as a button or use a real button that performs a programmatic navigation/reset.

### 4. Tablists lack accessible names

- **Severity:** MEDIUM  
- **Confidence:** High  
- **Files & regions:**
  - `src/app/(public)/practice/problems/[id]/page.tsx:522` — top-level tabs "Problem / Editorial / Accepted Solutions / Problem discussion".
  - `src/app/(public)/dashboard/_components/dashboard-judge-system-tabs.tsx:68` — "Judge runtime overview / Supported languages" tabs.
  - `src/app/(public)/problems/create/create-problem-form.tsx:595` — "Write / Preview" description tabs.
  - `src/app/(public)/contests/manage/[assignmentId]/page.tsx` — contest management tabs.
  - `src/components/code/compiler-client.tsx` — test-case tabs use a raw i18n key and also lack an `aria-label` on the `<Tabs>` root.
- **Problem:** Multiple tablists on a page are announced only as generic tab groups. Screen-reader users cannot distinguish them, and voice-control users cannot target a tablist by name.
- **Failure scenario:** On the problem page a user hears "tab group, 4 items" without context; on the dashboard the judge-system tabs are indistinguishable from any future tablists.
- **Fix:** Add `aria-label` (or `aria-labelledby`) to every `<Tabs>` root using localized strings, e.g., `<Tabs defaultValue="problem" aria-label={t("practice.problemTabsLabel")}>`.

### 5. Playground language selector and test-case tab are unlabeled / untranslated

- **Severity:** MEDIUM  
- **Confidence:** High  
- **File:** `src/components/code/compiler-client.tsx` (rendered at `/playground`)
- **Problem:**
  - The language `<Combobox>` at the top of the page has no associated `<Label>` and no `aria-label` on the trigger (`src/components/language-selector.tsx:156`).
  - The test-case tab is announced as the raw i18n key `compiler.testCaseLabel` because the tab value is initialized from `t("testCaseLabel")` before the locale messages are ready or because the key itself is being rendered when `name` is empty.
  - The test-case name `<Input>` at `:479` can display the raw key as its value.
- **Failure scenario:** Screen-reader users hear "combobox, Python (3.14)" with no label context, and the test-case tab is announced as `compiler.testCaseLabel` instead of "Test Case 1".
- **Fix:** Add a visible/associated label for the language selector (pass `id` and wrap with `<Label htmlFor={id}>`). Ensure the test-case tab label uses the localized string with the number substituted, and guard against rendering the raw key.

### 6. Missing visible focus indicators on custom interactive elements

- **Severity:** MEDIUM  
- **Confidence:** High  
- **Files & regions:**
  - `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:135-146` — `role="button"` div has `cursor-pointer` but no `focus-visible` ring.
  - `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:196-210` — dropzone `role="button"` has an `aria-label` but no `focus-visible` ring.
  - `src/components/contest/code-timeline-panel.tsx:211-221` — snapshot mini-timeline dots are tiny buttons with no focus ring.
  - `src/components/problem/problem-submission-form.tsx` — stdin toggle and copy buttons lack focus styles in some states.
  - `src/lib/plugins/chat-widget/chat-widget.tsx:319-335` — minimize/close header buttons have only `hover:bg-primary-foreground/20` and no focus ring.
  - `src/components/layout/public-header.tsx:235-244` — desktop auth action links have no `focus-visible` ring.
  - `src/components/layout/public-footer.tsx:52-59` — footer links have no `focus-visible` ring.
- **Problem:** WCAG 2.2 Focus Visible requires a visible indicator when an element receives keyboard focus. Several hand-rolled controls override or omit the ring.
- **Failure scenario:** A keyboard user cannot tell which row is active in the status board, which snapshot dot is selected, or which header/footer link is focused.
- **Fix:** Apply a consistent `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (or equivalent) to every interactive element that does not inherit one from `Button`. For tiny dots, enlarge the transparent hit area and add a focus outline.

### 7. Status-board row contains nested interactive content inside `role="button"`

- **Severity:** MEDIUM  
- **Confidence:** High  
- **File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:135-170`
- **Problem:** The row header is a `<div role="button" tabIndex={0}>` that also contains a student-name `<Link>` and a "View submissions" `<Button>`. Although `stopPropagation` is used on the inner links, the DOM still places focusable interactive children inside an element with button semantics. Screen readers may announce the row as a button while also announcing nested links/buttons, producing a confusing tab order and invalid accessibility tree.
- **Failure scenario:** A screen-reader user tabs to the row and hears a button that also contains a link; activating the row may unexpectedly toggle the collapsible instead of following the student link.
- **Fix:** Make the visual row header a layout container. Make only the chevron/title area the actual toggle (a real `<button type="button">`), and keep the student link and view-submissions button as separate, sibling focusable elements.

### 8. Chat widget has no focus trap and header buttons lack explicit type/ring

- **Severity:** MEDIUM  
- **Confidence:** Medium  
- **File:** `src/lib/plugins/chat-widget/chat-widget.tsx:313-411`
- **Problem:** When the chat panel is open it overlays the page, but focus is not trapped inside it. A keyboard user can tab behind the panel. The minimize/close header buttons are plain `<button>` elements without `type="button"` and without visible focus rings. The launcher button has `aria-label="Chat"` hardcoded in English instead of using the locale key.
- **Failure scenario:** With the chat open, pressing Tab moves focus to page controls hidden underneath; the launcher English label is announced to Korean users.
- **Fix:** Trap focus while the panel is open (use a small focus-trap hook or Base UI `Dialog`/`Popover`). Add `type="button"` and focus rings to header controls. Localize the launcher `aria-label` using `t("name")`.

### 9. Snapshot mini-timeline dots are too small and have no focus indicator

- **Severity:** MEDIUM  
- **Confidence:** High  
- **File:** `src/components/contest/code-timeline-panel.tsx:211-221`
- **Problem:** Each snapshot is a `<button>` rendered as a 2 px × 2 px (inactive) or 6 px × 2 px (active) rounded bar. This is far below the 24 × 24 CSS-pixel minimum touch-target size and has no visible focus state.
- **Failure scenario:** On a touch device the dots are nearly impossible to tap accurately; keyboard users cannot see which dot is focused.
- **Fix:** Increase the rendered bar to at least 24 px tall/wide, or wrap a transparent larger hit area around the visual bar. Add `focus-visible:ring-2`.

### 10. Some `<Button onClick>` components inside forms lack explicit `type="button"`

- **Severity:** LOW  
- **Confidence:** Medium  
- **Files & regions:**
  - `src/app/(public)/groups/[id]/group-instructors-manager.tsx:160`
  - `src/app/(public)/groups/[id]/group-members-manager.tsx:399`
  - `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:100`, `:115`, `:230`
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:407`, `:502`, `:606`, `:609`, `:740`, `:743`
  - `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:356`, `:433`, `:436`
  - `src/components/contest/access-code-manager.tsx:157`, `:163`, `:167`, `:194`
  - `src/components/contest/recruiting-invitations-panel.tsx:547`, `:550`
- **Problem:** The project `Button` does not default to `type="button"`. Inside a `<form>` any button without an explicit type submits the form. Many of these buttons appear inside dialogs or cards, but some (e.g., language-config table actions) are in forms and could trigger an unintended submit if markup shifts.
- **Failure scenario:** In a future refactor a dialog button is moved inside a form; pressing Enter or clicking it submits the form unexpectedly.
- **Fix:** Adopt the convention `type="button"` on every `<Button>` whose `onClick` is not a form submission. Consider adding the default to `src/components/ui/button.tsx` for safety.

### 11. Auth layout lacks header/navigation landmark

- **Severity:** LOW  
- **Confidence:** High  
- **File:** `src/app/(auth)/layout.tsx:21-36`
- **Problem:** The auth layout renders the site title as a plain `<Link>` inside a `<div>` and places the theme/locale toggles in another `<div>`. Unlike the public layout, there is no `<header>` or `<nav>` landmark, so screen-reader users browsing by landmark will not find the auth chrome.
- **Failure scenario:** A screen-reader user navigating by landmarks on the login page finds only `main` and `contentinfo`; they must tab through the page to reach the home link or theme toggle.
- **Fix:** Wrap the auth chrome in `<header>` and, if appropriate, `<nav aria-label={tCommon("authNavigation")}>`. Ensure the skip-link target still resolves correctly.

### 12. Problem detail page skips heading level

- **Severity:** LOW  
- **Confidence:** Medium  
- **File:** `src/app/(public)/practice/problems/[id]/page.tsx:521-560`
- **Problem:** The page has an `<h1>` for the problem title and then `<h3>` elements for "Problem", "Constraints", and "Examples" with no intervening `<h2>`. This creates a heading-level gap that can disorient screen-reader users who navigate by heading.
- **Failure scenario:** A screen-reader user pressing the heading shortcut jumps from level 1 to level 3 and may miss the logical structure of the statement.
- **Fix:** Change the section headings to `<h2>` or introduce an `<h2>` section title (e.g., "Statement") that wraps the description content.

### 13. Copy-code buttons lack descriptive labels

- **Severity:** LOW  
- **Confidence:** High  
- **File:** `src/app/(public)/practice/problems/[id]/page.tsx` (rendered via `PublicProblemDetail`)
- **Problem:** The "Copy code" buttons next to each example have identical accessible names. A screen-reader user cannot tell which example (Input 1, Output 1, etc.) will be copied.
- **Failure scenario:** Multiple "Copy code" buttons on the same page are indistinguishable when navigating by button name.
- **Fix:** Add an `aria-label` such as `t("copyInputExample", { number: 1 })` / `t("copyOutputExample", { number: 1 })` to each copy button.

### 14. Page-size links lack a programmatic group label

- **Severity:** LOW  
- **Confidence:** Medium  
- **File:** `src/app/(public)/practice/page.tsx` and pagination controls
- **Problem:** The "Page size" text is a static paragraph, and the page-size options are plain links announced only as "10", "20", "50", "100". There is no `<nav aria-label="Page size">` or fieldset/legend grouping them with the label.
- **Failure scenario:** A screen-reader user tabbing through pagination hears unlabeled number links and cannot associate them with page-size selection.
- **Fix:** Wrap the page-size links in `<nav aria-label={t("pageSizeLabel")}>` or convert the group to a `<fieldset>` with a `<legend>`.

### 15. Recruiting organization logo may have empty alt text

- **Severity:** LOW  
- **Confidence:** Medium  
- **File:** `src/app/(auth)/recruit/[token]/page.tsx:238-242`
- **Problem:** The organization logo uses `alt={assignment.organizationName ?? ""}`. If the admin did not set an organization name, the image has an empty `alt`, which causes screen readers to ignore a meaningful visual element (the logo at the top of the invitation).
- **Failure scenario:** A blind candidate does not hear any indication that a logo is present, even though it visually brands the invitation.
- **Fix:** Provide a fallback alt such as `alt={assignment.organizationName ?? t("organizationLogo")}`.

---

## Browser Verification Notes

A local dev server was started against the `judgekit-postgres` container (`DATABASE_URL=postgres://judgekit:judgekit@localhost:5432/judgekit`, `AUTH_URL=http://localhost:3000`). The following pages were inspected with `agent-browser` accessibility snapshots:

- `/` (home) — good landmarks (`banner`, `navigation`, `main`, `contentinfo`), skip link, labeled navigation, logical heading structure.
- `/login` — form labels are programmatically associated; password show/hide button is present; the auth chrome lacks a `banner`/`navigation` landmark.
- `/practice` — filter form labels are associated; table headers are present; the "Reset" link contains a nested button; page-size links lack a group label.
- `/practice/problems/:id` — tabs lack accessible names; "Try in playground", "Sign in to submit", "Rankings", "Edit problem", and "Submit solution" are nested `<Link><Button>` controls; section headings jump from `h1` to `h3`; "Copy code" buttons have identical labels.
- `/playground` — language combobox has no label; test-case tab shows raw i18n key `compiler.testCaseLabel`; the test-case name input can contain the raw key.

Authentication required credentials that did not match the current local database, so dashboard/admin pages were reviewed in source rather than in the browser.

---

## Positive Findings

- **Korean typography is handled correctly.** All `tracking-*` utilities are applied conditionally (`locale !== "ko"`), and `src/app/globals.css` uses CSS custom properties so `html:lang(ko)` resets letter-spacing to `normal` for body and headings.
- **ARIA landmarks and live regions are widely present.** Loading spinners use `role="status"`, error text uses `role="alert"` with `aria-live="polite"`, pagination uses `role="navigation"` with `aria-label`, charts use `role="img"` with `aria-label`, and the anti-cheat filters use `aria-pressed`.
- **Form error patterns exist in key forms.** Sign-up, system-settings, and language-config forms use `aria-invalid` + `aria-describedby` to link inputs to error messages.
- **Skip-to-content link exists and is focusable** (`src/components/layout/skip-to-content.tsx`).
- **Reduced-motion support is global** via `src/app/globals.css` `@media (prefers-reduced-motion: reduce)`.
- **Empty, loading, and error states exist** for public pages, dashboard, admin, problems, groups, contests, and auth.
- **Mobile navigation has good keyboard behavior.** `src/components/layout/public-header.tsx` implements Escape-to-close, focus-first-item-on-open, focus-wrap, and focus restoration to the toggle button.

---

## Final Sweep — Commonly Missed UI/UX Issues

- **Focus traps:** The chat widget is the only obvious overlay without a focus trap; dialogs use Radix-based components that trap focus correctly.
- **Color contrast:** The default Shadcn/UI token set generally meets WCAG 2.2 contrast requirements; the lecture-mode themes are intentionally high-contrast.
- **Reduced motion:** The global media query covers CSS animations; `motion-safe:` is used in the chat typing indicator.
- **Touch targets:** The snapshot mini-timeline dots are the only clearly undersized controls; most buttons and links meet the 24 × 24 CSS-pixel minimum.
- **RTL:** Only one explicit `rtl:` utility was found; the app is primarily LTR. next-intl supports RTL locales if added in the future.
- **Error boundaries:** `error.tsx` pages exist in major route groups.
- **Loading states:** `loading.tsx` skeletons exist for public, dashboard, admin, and auth route groups.

The highest-value fixes for the next cycle remain: (1) populate `<SelectValue>` with labels, (2) associate every `<Label>` with its control via `htmlFor`, and (3) remove `<Button>` children from `<Link>` wrappers.
