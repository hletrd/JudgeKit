# UI/UX Review — JudgeKit Next.js Frontend

**Review date:** 2026-07-02  
**Scope:** `src/app/**/*.tsx`, `src/components/**/*.tsx`, `src/hooks/**/*.ts`, `src/contexts/**/*.ts`, `src/app/globals.css`, `next.config.ts`, `components.json`, i18n messages, public assets.  
**Method:** Static code analysis plus a successful dev-server run against the local `judgekit-playwright-db` Postgres container. Live browser inspection was performed with `agent-browser` on home, login, practice, problem detail, playground, dashboard, and admin language-management pages. Some findings are confirmed only in source code where the page requires unavailable state.

---

## Summary

The JudgeKit UI is generally well engineered: Tailwind v4 + CSS variables provide light/dark/lecture theming, Korean letter-spacing is guarded behind locale checks, ARIA landmarks/roles are used throughout loading states, pagination, charts, and forms, and empty/error/loading pages exist for the major route groups. Browser verification confirmed most landmark/label associations work, but it also surfaced a few new issues. The biggest remaining UX risks are:

1. **`<SelectValue />` left empty in several selects**, which breaks the project’s own Select rule and will display raw IDs instead of labels.
2. **Many form labels are not programmatically associated** with their inputs (no `htmlFor`/no wrapping), hurting screen-reader efficiency and click-to-focus behavior.
3. **Several custom buttons and link cards lack visible focus indicators**, making keyboard navigation hard.
4. **A few custom interactive elements** (status-board row, chat widget, snapshot dots) have small hit areas, missing focus rings, or contain nested interactive content inside a `role="button"`.
5. **Tablists and some selects lack accessible names**, so screen-reader users cannot distinguish multiple tab groups or identify the playground language selector.
6. **`<Link>` elements wrapping `<Button>` components** create invalid nested interactive controls in the dashboard and problem-detail pages.

No findings suggest the app is unusable, but the first two should be fixed before the next deploy because they directly violate in-project conventions and WCAG 2.2 form-label requirements.

---

## UI Inventory Reviewed

- **Routes / layouts:** `src/app/layout.tsx`, `src/app/(public)/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/(auth)/layout.tsx`, all `loading.tsx`, `error.tsx`, and `not-found.tsx` pages.
- **Global styles:** `src/app/globals.css` (theme tokens, Korean letter-spacing overrides, reduced-motion media query, lecture-mode themes, problem-description typography).
- **Design system:** `src/components/ui/*` (Button, Input, Textarea, Select, Dialog, AlertDialog, Sheet, DropdownMenu, Checkbox, Label, Badge, Skeleton, Table, Tabs, Sonner, Tooltip, etc.).
- **Layout components:** Public header/footer, dashboard sidebar, skip-to-content, breadcrumb, theme/locale/lecture toggles.
- **Feature surfaces:** Problem create/edit, submission form, compiler/playground, contest management, anti-cheat dashboard, recruiting invitations, groups, file management, admin settings, chat widget.
- **Assets:** `public/`, `static-site/nginx.conf`, OG image route.

---

## Findings

### 1. Empty `<SelectValue />` shows raw option values

- **Severity:** Medium  
- **Confidence:** High  
- **Files & regions:**
  - `src/app/(public)/groups/[id]/assignments/[assignmentId]/filter-form.tsx:81`
  - `src/components/problem/accepted-solutions.tsx:121` and `:136`
  - `src/components/contest/score-timeline-chart.tsx:66`
  - `src/components/contest/contest-replay.tsx:222`
  - `src/components/contest/contest-clarifications.tsx:203`
  - `src/components/contest/anti-cheat-dashboard.tsx:504`
- **Problem:** `AGENTS.md` explicitly forbids `<SelectValue />` without static children because `@base-ui/react/select` will render the raw `value` string. In these selects the trigger is empty, so users see raw status IDs, user IDs, `all`, or `general` instead of the localized labels.
- **Failure scenario:** A student opens the assignment status filter and sees `all` / `accepted` / `rejected` raw keys, or an admin sees a raw nanoid in the participant selector.
- **Fix:** Use the project pattern `<SelectValue>{labelMap[stateVar] || stateVar}</SelectValue>` in every trigger. For pick-to-add selects, force remount with `key` after selection.

### 2. Form labels not associated with their controls

- **Severity:** Medium  
- **Confidence:** High  
- **Files & regions (representative list):**
  - `src/components/contest/quick-create-contest-form.tsx:106`, `:115`, `:126`, `:140`, `:151`
  - `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:429`, `:461`, `:477`, `:497`, `:517`, `:632`
  - `src/app/(public)/groups/edit-group-dialog.tsx:138`
  - `src/app/(public)/profile/page.tsx:83`
  - `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:387`, `:408`
  - `src/app/(dashboard)/dashboard/admin/settings/home-page-content-form.tsx:129`, `:137`, `:145`
  - `src/app/(dashboard)/dashboard/admin/settings/footer-content-form.tsx:140`, `:149`
  - `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:196`
  - `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:391`, `:399`, `:418`
  - `src/lib/plugins/chat-widget/admin-config.tsx:158`, `:172`, `:193`, `:260`, `:278`, `:295`, `:306`
  - `src/components/problem/function-reference-solution.tsx:156`
  - `src/components/contest/recruiting-invitations-panel.tsx:456`, `:464`, `:473`, `:501`
- **Problem:** The project’s `Label` component (`src/components/ui/label.tsx`) renders a plain `<label>`. When it is used as a sibling of an `<Input>`/`<Select>`/`<Textarea>` without `htmlFor` and without wrapping the control, there is no programmatic association. Clicking the label does not focus the field, and screen readers may not reliably announce the label when the user tabs to the control.
- **Failure scenario:** A keyboard user tabs to the “Duration” field in the quick-create form; the screen reader only reads the placeholder/number, not the label. A mouse user clicks “Assessment title” and the input does not receive focus.
- **Fix:** Add matching `id` props to every input/select/textarea and `htmlFor` to their `Label`s. Where the label text is a section heading (e.g., “SMTP settings”), wrap the controls in `<fieldset>/<legend>` or use `aria-labelledby` instead.

### 3. Missing visible focus indicators on custom interactive elements

- **Severity:** Medium  
- **Confidence:** High  
- **Files & regions:**
  - `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:135-146` — `role="button"` div has `cursor-pointer` but no `focus-visible` ring.
  - `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:196-210` — dropzone `role="button"` has no focus ring.
  - `src/app/(public)/contests/manage/[assignmentId]/students/[userId]/page.tsx:146` — `<Link className="block focus:outline-none">` removes the default focus outline with no replacement.
  - `src/components/contest/participant-anti-cheat-timeline.tsx:341-347` and `src/components/contest/anti-cheat-dashboard.tsx:619-637` — expand/collapse buttons use `focus:outline-none` with no ring.
  - `src/components/problem/problem-submission-form.tsx:450-459` — stdin toggle `<button>` has no focus style.
  - `src/lib/plugins/chat-widget/chat-widget.tsx:286-292`, `:298-310`, `:319-335` — launcher, minimize, and close buttons use `focus:outline-none focus:ring-2` (good), but the header minimize/close buttons have only `hover:bg-primary-foreground/20` and no focus ring.
  - `src/components/layout/lecture-mode-toggle.tsx:70-84` — the in-dropdown toggle switch has no focus-visible ring.
  - `src/components/layout/public-header.tsx:235-244` — desktop auth action links have no `focus-visible` ring.
  - `src/components/layout/public-footer.tsx:52-59` — footer links have no `focus-visible` ring.
  - `src/components/contest/code-timeline-panel.tsx:211-221` — snapshot mini-timeline dots are tiny buttons with no focus ring.
- **Problem:** WCAG 2.2 Focus Visible requires a visible indicator when an element receives keyboard focus. Several hand-rolled controls override or omit the ring.
- **Failure scenario:** A keyboard user cannot tell which row is active in the status board, which link is focused on the student detail page, or which snapshot dot is selected in the replay timeline.
- **Fix:** Apply a consistent `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (or equivalent) to every interactive element that does not inherit one from `Button`. For tiny dots, enlarge the transparent hit area and add a focus outline.

### 4. Interactive content nested inside a `role="button"` container

- **Severity:** Medium  
- **Confidence:** High  
- **File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:135-170`
- **Problem:** The row header is a `<div role="button" tabIndex={0}>` that also contains a student-name `<Link>` and a “View submissions” `<Button>`. Although `stopPropagation` is used on the inner links, the DOM still places focusable interactive children inside an element with button semantics. Screen readers may announce the row as a button while also announcing nested links/buttons, producing a confusing tab order and invalid accessibility tree.
- **Failure scenario:** A screen-reader user tabs to the row and hears a button that also contains a link; activating the row may unexpectedly toggle the collapsible instead of following the student link.
- **Fix:** Make the visual row header a layout container. Make only the chevron/title area the actual toggle (a real `<button type="button">`), and keep the student link and view-submissions button as separate, sibling focusable elements.

### 5. Chat widget has no focus trap and header buttons lack explicit type/ring

- **Severity:** Low–Medium  
- **Confidence:** Medium  
- **File:** `src/lib/plugins/chat-widget/chat-widget.tsx:313-411`
- **Problem:** When the chat panel is open it overlays the page, but focus is not trapped inside it. A keyboard user can tab behind the panel. The minimize/close header buttons are plain `<button>` elements without `type="button"` and without visible focus rings, and the launcher button has `aria-label="Chat"` hardcoded in English instead of using the locale key.
- **Failure scenario:** With the chat open, pressing Tab moves focus to page controls hidden underneath; the launcher English label is announced to Korean users.
- **Fix:** Trap focus while the panel is open (use a small focus-trap hook or Base UI `Dialog`/`Popover`). Add `type="button"` and focus rings to header controls. Localize the launcher `aria-label`.

### 6. Snapshot mini-timeline dots are too small and have no focus indicator

- **Severity:** Medium  
- **Confidence:** High  
- **File:** `src/components/contest/code-timeline-panel.tsx:211-221`
- **Problem:** Each snapshot is a `<button>` rendered as a 2 px × 2 px (inactive) or 6 px × 2 px (active) rounded bar. This is far below the 24 × 24 CSS-pixel minimum touch-target size and has no visible focus state.
- **Failure scenario:** On a touch device the dots are nearly impossible to tap accurately; keyboard users cannot see which dot is focused.
- **Fix:** Increase the rendered bar to at least 24 px tall/wide, or wrap a transparent larger hit area around the visual bar. Add `focus-visible:ring-2`.

### 7. Some `<Button onClick>` components inside forms lack explicit `type="button"`

- **Severity:** Low  
- **Confidence:** Medium  
- **Files & regions:**
  - `src/app/(public)/groups/[id]/group-members-manager.tsx:399`
  - `src/app/(public)/groups/[id]/group-instructors-manager.tsx:160`
  - `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:100`, `:115`, `:230`
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:407`, `:502`, `:606`, `:609`, `:740`, `:743`
  - `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:356`, `:433`, `:436`
  - `src/components/contest/access-code-manager.tsx:157`, `:163`, `:167`, `:194`
  - `src/components/contest/recruiting-invitations-panel.tsx:547`, `:550`
- **Problem:** The project `Button` does not default to `type="button"`. Inside a `<form>` any button without an explicit type submits the form. Many of these buttons appear inside dialogs or cards, but some (e.g., language-config table actions) are in forms and could trigger an unintended submit if markup shifts.
- **Failure scenario:** In a future refactor a dialog button is moved inside a form; pressing Enter or clicking it submits the form unexpectedly.
- **Fix:** Adopt the convention `type="button"` on every `<Button>` whose `onClick` is not a form submission. Consider adding the default to `src/components/ui/button.tsx` for safety.

### 8. Footer and header action links lack focus rings

- **Severity:** Low  
- **Confidence:** High  
- **Files:** `src/components/layout/public-footer.tsx:52-59`, `src/components/layout/public-header.tsx:235-244`
- **Problem:** These text links only change color on hover; they have no `:focus-visible` outline, so keyboard users cannot see focus.
- **Fix:** Add the same `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` used elsewhere in the header.

### 9. Tablists lack accessible names

- **Severity:** Low–Medium  
- **Confidence:** High  
- **Files & regions (verified in browser):**
  - `src/app/(public)/practice/problems/[id]/page.tsx` — top-level tabs “Problem / Editorial / Accepted Solutions / Problem discussion” have no `aria-label`.
  - `src/app/(dashboard)/dashboard/page.tsx` — “Judge runtime overview / Supported languages” tabs have no `aria-label`.
  - `src/components/code/compiler-client.tsx` — test-case tabs use a raw i18n key.
- **Problem:** Multiple tablists on a page are announced only as generic tab groups. Screen-reader users cannot distinguish them, and voice-control users cannot target a tablist by name.
- **Failure scenario:** On the problem page a user hears “tab group, 4 items” without context; on the dashboard the judge-system tabs are indistinguishable from any future tablists.
- **Fix:** Add `aria-label` (or `aria-labelledby`) to every `<Tabs>` root using localized strings.

### 10. Nested `<Link>` wrapping `<Button>` creates invalid interactive nesting

- **Severity:** Low–Medium  
- **Confidence:** High  
- **Files & regions (verified in browser):**
  - `src/app/(dashboard)/dashboard/page.tsx` — Admin shortcut cards are `<Link>` elements containing `<Button>` children.
  - `src/app/(public)/practice/problems/[id]/page.tsx` — “Try in playground”, “Sign in to submit”, and “Rankings” are `<Link>` elements containing `<Button>` children.
- **Problem:** The accessibility tree exposes a link with a nested button. HTML does not allow interactive content inside a link, and screen readers may ignore or misreport the nested button. Keyboard activation can behave inconsistently.
- **Failure scenario:** A screen-reader user tabs to the “Try in playground” control and hears a link that contains a button; activating it may not follow the link reliably.
- **Fix:** Use a plain styled `<a>`/`<Link>` without an inner `<Button>`, or use a `<Button asChild>` pattern so only one focusable element is rendered.

### 11. Playground shows untranslated i18n keys and unlabeled controls

- **Severity:** Low  
- **Confidence:** High  
- **File:** `src/components/code/compiler-client.tsx` (rendered at `/playground`)
- **Problem:** The test-case tab is announced as `"compiler.testCaseLabel"` and the test-case textbox contains that raw key as its value. The language `<Select>` at the top of the page has no associated `<Label>`.
- **Failure scenario:** Screen-reader users hear raw translation keys instead of meaningful labels.
- **Fix:** Pass the localized string for the test-case tab label and placeholder, and add a visible/associated label for the language selector.

---

## Browser Verification Notes

A local dev server was started against the `judgekit-playwright-db` Postgres container (`DATABASE_URL=postgres://judgekit:judgekit_test@localhost:55432/judgekit`). The following pages were inspected with `agent-browser` accessibility snapshots:

- `/` (home) — good landmarks, skip link, labeled navigation, heading structure.
- `/login` — form labels are programmatically associated; password show/hide button is present.
- `/practice` — filter form labels are associated; table headers are present; page-size links lack a programmatic label.
- `/practice/problems/<nanoid>` — tabs lack accessible names; “Try in playground” / “Sign in to submit” / “Rankings” are nested `<Link><Button>` controls.
- `/playground` — language select is unlabeled; test-case tab shows raw i18n key `compiler.testCaseLabel`.
- `/dashboard` (after seeding admin `/admin` / `admin123`) — admin shortcut cards are nested `<Link><Button>`; judge-system tabs lack accessible names.
- `/dashboard/admin/languages` — loads; table checkboxes include the language name in their accessible label; search input and “Add Language” button are present.

Authentication required `AUTH_URL=http://localhost:3000` to avoid the default `.env` value (`http://localhost:4000`) causing an `UntrustedHost` error.

---

## Positive Findings

- **Korean typography is handled correctly.** All `tracking-*` utilities are applied conditionally (`locale !== "ko"`), and `src/app/globals.css` uses CSS custom properties so `html:lang(ko)` resets letter-spacing to `normal` for body and headings.
- **ARIA landmarks and live regions are widely present.** Loading spinners use `role="status"`, error text uses `role="alert"` with `aria-live="polite"`, pagination uses `role="navigation"` with `aria-label`, charts use `role="img"` with `aria-label`, and the anti-cheat filters use `aria-pressed`.
- **Form error patterns are mostly good.** Sign-up, reset-password, login, and system-settings forms use `aria-invalid` + `aria-describedby` to link inputs to error messages.
- **Skip-to-content link exists and is focusable** (`src/components/layout/skip-to-content.tsx`).
- **Reduced-motion support is global** via `src/app/globals.css` `@media (prefers-reduced-motion: reduce)`.
- **Empty, loading, and error states exist** for public pages, dashboard, admin, problems, groups, contests, and auth.

---

## Final Sweep Notes

- No `onClick` handlers were found on non-interactive elements without a role/button pattern (the only custom clickable divs are the status-board row and file-upload dropzone, both given `role="button"` and keyboard handlers).
- Only three `dangerouslySetInnerHTML` usages exist, all sanitized (`sanitizeHtml`, `safeJsonForScript`, syntax highlighting).
- `target="_blank"` links all include `rel="noopener noreferrer"`.
- Images (`<img>` and `<Image>`) include `alt` text.
- Hardcoded hex colors are limited to code-editor themes, OG image generation, and tag color presets; they do not bypass the design-system tokens for UI chrome.
- The SelectItem `label` prop is present on all inspected items (a couple of multi-line props looked missing at first but the prop is on the next line).

---

## Recommended Fix Priority

1. **High-impact, low effort:** Fill every empty `<SelectValue />` with the selected label.
2. **High-impact:** Add `htmlFor`/`id` pairs (or wrap controls) for all form labels listed above.
3. **Medium-impact:** Audit and add visible focus rings to the custom buttons, link cards, dropzone, chat widget header, and snapshot dots.
4. **Medium-impact:** Restructure the status-board row so it does not nest links/buttons inside a `role="button"`.
5. **Medium-impact:** Add `aria-label` (or `aria-labelledby`) to every `<Tabs>` root and to standalone selects such as the playground language selector.
6. **Medium-impact:** Remove nested `<Button>` children from `<Link>` cards and problem-detail action links.
7. **Low-impact cleanup:** Add `type="button"` to all non-submit buttons, localize the chat launcher label, and fix the playground test-case i18n key.
