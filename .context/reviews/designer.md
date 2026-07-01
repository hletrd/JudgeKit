# UI/UX Design Review

Date: 2026-07-01
Scope: entire repository (`/tmp/judgekit-local`) — Next.js app, design system, components, public/dashboard/auth pages, and related tests
Method: static/code analysis (runtime browser inspection was infeasible because the standalone server requires a reachable PostgreSQL database; see Final sweep)
Summary: The design system is well-structured and already guards several accessibility regressions via unit tests (select-value labels, diff +/- cues, code-editor focus trap). Recurring gaps remain around programmatic labelling, WCAG contrast, single-key screen-reader conflicts, and form error association. No CRITICAL issues were found.
Findings count: 15

---

## MEDIUM: Dialog and Sheet close buttons expose a duplicate accessible name
**Classification:** MEDIUM | **Confidence:** High
- **Files:**
  - `src/components/ui/dialog.tsx` (lines 66-79)
  - `src/components/ui/sheet.tsx` (lines 66-79)
- **Problem:** `DialogPrimitive.Close` / `SheetPrimitive.Close` is rendered with a `Button` that already has `aria-label={tCommon("close")}` inside the `render` prop, and then contains children `<XIcon aria-hidden="true" />` plus `<span className="sr-only">{tCommon("close")}</span>`. Depending on how Base UI derives the accessible name, screen-reader users may hear "close close button" or a brittle label. In addition, `DialogContent` / `SheetContent` do not forward an `aria-labelledby` attribute pointing at `DialogTitle` / `SheetTitle`, so the modal lacks a programmatic name unless the caller adds one manually.
- **Failure scenario:** A screen-reader user opening a dialog or sheet hears a duplicated or inconsistent label and cannot rely on the title to identify the modal.
- **Suggested fix:** Remove either the `aria-label` on the `Button` or the inner `sr-only` text — not both. Generate an `id` for `DialogTitle` / `SheetTitle` and pass `aria-labelledby={titleId}` to `DialogPrimitive.Popup` / `SheetPrimitive.Popup` from `DialogContent` / `SheetContent`.
- **Cross-references:** `src/components/ui/button.tsx`, `tests/unit/a11y-review-fixes-implementation.test.ts`

## MEDIUM: Tab panels lack programmatic labels on nested tab sets
**Classification:** MEDIUM | **Confidence:** High
- **Files:**
  - `src/app/(public)/practice/problems/[id]/page.tsx` (lines 522 and 879)
  - `src/app/(public)/dashboard/_components/dashboard-judge-system-tabs.tsx` (line 68)
  - `src/components/code/compiler-client.tsx` (lines 452 and 551)
  - `src/components/submissions/output-diff-view.tsx` (line 30)
- **Problem:** Multiple `<Tabs>` instances on the same page are rendered without an `aria-label`. The practice problem page contains a top-level tablist ("problem / editorial / accepted-solutions / discussion") and a nested tablist inside the discussion tab ("questions / solutions"). Screen-reader users cannot distinguish the two tablists, and voice-control users cannot target a tablist by name.
- **Failure scenario:** VoiceOver/NVDA rotor lists two generic "tab groups, 2/3 items" with no context; a voice-control user cannot say "switch to accepted solutions" because the tablist has no accessible name.
- **Suggested fix:** Add `aria-label` (or `aria-labelledby`) to every `<Tabs>` root. Example: `<Tabs defaultValue="problem" aria-label={t("problemSections")}>`. For `output-diff-view.tsx`, use `aria-label={t("diffViews")}`.
- **Cross-references:** `src/components/ui/tabs.tsx`

## MEDIUM: Yellow/amber semantic text likely fails WCAG AA contrast
**Classification:** MEDIUM | **Confidence:** High
- **Files:**
  - `src/app/(public)/_components/public-problem-list.tsx` (line 163)
  - `src/components/contest/leaderboard-table.tsx` (line 98)
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx` (lines 479 and 484)
  - `src/lib/ratings.ts` (line 25) — consumed by `src/components/tier-badge.tsx`
- **Problem:** `text-yellow-600` on a white/light surface is estimated at roughly 3.5:1–4.0:1, below the 4.5:1 required for normal body text under WCAG 2.2 1.4.3. The success-rate indicator, first-place rank, and image-status badges all rely on this yellow. The tier-badge `gold` tier uses the same yellow-on-yellow-50 combination, which is also low-contrast.
- **Failure scenario:** Users with low contrast sensitivity cannot distinguish a 50% success rate from 80%, cannot identify first place on the leaderboard, and cannot reliably read the "stale"/"load error" badge text.
- **Suggested fix:** Move to a darker hue such as `text-yellow-700`/`amber-700` (target >= 4.5:1 on white) or add non-color cues (icon, weight). For tier badges, either darken the text or remove the tinted background so the text sits on the page surface.
- **Cross-references:** `src/app/globals.css`, `tests/unit/a11y-review-fixes-implementation.test.ts`

## MEDIUM: Empty `<SelectValue />` causes triggers to display raw values instead of labels
**Classification:** MEDIUM | **Confidence:** High
- **Files:**
  - `src/app/(public)/groups/[id]/assignments/[assignmentId]/filter-form.tsx` (line 81)
  - `src/components/problem/accepted-solutions.tsx` (lines 121 and 136)
  - `src/components/contest/score-timeline-chart.tsx` (line 66)
  - `src/components/contest/contest-replay.tsx` (line 222)
  - `src/components/contest/anti-cheat-dashboard.tsx` (line 504)
  - `src/components/contest/contest-clarifications.tsx` (line 203)
- **Problem:** These call sites render `<SelectValue />` with no children. Base UI falls back to the raw `value` string, so users see untranslated keys or opaque identifiers such as `"newest"`, `"shortest"`, a user UUID, a problem UUID, or a numeric playback speed instead of the human-readable label defined on `<SelectItem>`.
- **Failure scenario:** A user opens the accepted-solutions sort select and sees the raw key `"shortest"` rather than the translated label. In the anti-cheat dashboard the participant filter shows a raw user id.
- **Suggested fix:** Pass the selected label as children to `<SelectValue>`, mirroring the pattern already used in `api-keys-client.tsx`, `create-problem-form.tsx`, and `system-settings-form.tsx`. Add these call sites to `tests/unit/select-value-contract-implementation.test.ts`.
- **Cross-references:** `src/components/ui/select.tsx`, `AGENTS.md`, `tests/unit/select-value-contract-implementation.test.ts`

## MEDIUM: Single-key "n"/"p" shortcuts conflict with screen-reader reading keys
**Classification:** MEDIUM | **Confidence:** Medium
- **Files:**
  - `src/app/(public)/practice/problems/[id]/problem-keyboard-nav.tsx` (lines 15-18)
  - `src/hooks/use-keyboard-shortcuts.ts` (lines 32-67)
- **Problem:** The component registers unmodified `n` and `p` keys to navigate to the next/previous problem. These keys are commonly used by NVDA/JAWS for next/previous paragraph and by VoiceOver users typing by voice. The hook supports modifiers, but this caller does not use them, and focus is not moved to the new problem's heading after navigation.
- **Failure scenario:** A screen-reader user presses "p" to read the previous paragraph and is unexpectedly navigated to the previous problem; focus lands in an unknown location and the page context is lost.
- **Suggested fix:** Require a modifier for problem navigation, e.g. `Alt+n` / `Alt+p`, or provide a user preference to disable single-key shortcuts. After navigation, programmatically move focus to the top of the new problem content (`#main-content` or the problem heading) and announce the change via an `aria-live` region.
- **Cross-references:** `src/app/(public)/practice/problems/[id]/page.tsx`

## MEDIUM: Login form errors are not programmatically associated with inputs
**Classification:** MEDIUM | **Confidence:** High
- **File:** `src/app/(auth)/login/login-form.tsx` (lines 62-101)
- **Problem:** When login fails, the error is rendered inside `<p role="alert" aria-live="polite">`. The email/username and password inputs do not receive `aria-invalid="true"`, and none are linked to the alert via `aria-describedby`. The summary is generic ("Invalid credentials") and does not indicate which field failed.
- **Failure scenario:** A screen-reader user tabs back to the email field after a failed login and has no programmatic indication that the field is invalid or that it relates to the alert text. Magnifier users may miss the alert if it appears outside the zoomed viewport.
- **Suggested fix:** Add `aria-invalid={!!error}` and `aria-describedby="login-error"` to both inputs, and give the alert paragraph `id="login-error"`. For server-returned field-specific errors, expose them on the relevant field.
- **Cross-references:** `src/app/(auth)/signup/signup-form.tsx` (good example of `aria-invalid`/`aria-describedby`)

## MEDIUM: Contest join success state is not announced and redirects quickly
**Classification:** MEDIUM | **Confidence:** Medium
- **File:** `src/app/(public)/contests/join/contest-join-client.tsx` (lines 101-105)
- **Problem:** After a successful join, the UI shows a green `CheckCircle2` icon with `animate-pulse` plus green success text, but there is no `aria-live` announcement. The redirect is delayed by a timer; during that interval a screen-reader user hears nothing.
- **Failure scenario:** A screen-reader user submits the form, hears the button revert to its default state, and receives no confirmation that the join succeeded before the redirect occurs.
- **Suggested fix:** Wrap the success message in a container with `role="status" aria-live="polite"` and move focus to it when `success` becomes true. Make the auto-redirect delay configurable or longer so users have time to hear the confirmation.
- **Cross-references:** `src/components/ui/sonner.tsx`

## MEDIUM: StatusBoard mobile card uses invalid nested interactive elements
**Classification:** MEDIUM | **Confidence:** High
- **File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx` (lines 135-190)
- **Problem:** The mobile card uses a `<div role="button" tabIndex={0}>` that contains a student-name `<Link>` and, in contest view, a "view submissions" `<Button>` wrapped in another `<Link>`. Nesting interactive controls inside a button is invalid HTML and breaks keyboard/assistive-technology behavior. The custom role=button also requires manual Enter/Space handling.
- **Failure scenario:** Voice-control users cannot say "click view submissions" because the target is inside a generic `div`. Keyboard users may activate the wrong action because click/key events bubble inconsistently. Screen readers may not expose the nested links as interactive.
- **Suggested fix:** Restructure the card so the expand/collapse action is a separate native `<button>` (or the whole header row is a `<button>`) and the nested links/buttons are siblings, not children. Remove the manual keyboard handler once a native button is used.
- **Cross-references:** `src/components/ui/button.tsx`, `src/components/ui/collapsible.tsx`

## MEDIUM: Many form labels are not programmatically associated with controls
**Classification:** MEDIUM | **Confidence:** High
- **Files (representative call sites):**
  - `src/lib/plugins/chat-widget/admin-config.tsx` (lines 158, 172, 193, 260, 278, 295, 306)
  - `src/components/contest/recruiting-invitations-panel.tsx` (lines 456, 464, 473, 501)
  - `src/components/contest/quick-create-contest-form.tsx` (lines 106, 115, 126, 140, 151)
  - `src/components/problem/function-reference-solution.tsx` (lines 156, 188)
  - `src/components/contest/contest-clarifications.tsx` (line 200)
  - `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx` (lines 387, 408)
  - `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx` (line 196)
  - `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx` (lines 391, 399, 418)
  - `src/app/(dashboard)/dashboard/admin/settings/home-page-content-form.tsx` (lines 129, 137, 145)
  - `src/app/(dashboard)/dashboard/admin/settings/footer-content-form.tsx` (lines 140, 149)
- **Problem:** The `Label` component is a thin wrapper around `<label>`. When `<Label>` is used without `htmlFor` and the associated input/select/textarea is not nested inside it, clicking the label does not focus the control, and screen-reader users lose the programmatic name association.
- **Failure scenario:** A screen-reader user exploring the chat-widget admin form hears a "provider" label but the select is not programmatically named by it. A voice-control user cannot say "click Provider" to focus the select.
- **Suggested fix:** Add `htmlFor` to each `<Label>` matching the `id` on the associated control, or wrap the control inside the `<Label>`. For controls inside a `Select` whose trigger lacks an `id`, add an `id` to `SelectTrigger`.
- **Cross-references:** `src/components/ui/label.tsx`

## LOW: File upload dropzone has faint border and custom keyboard behavior
**Classification:** LOW | **Confidence:** Medium
- **File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx` (lines 196-225, 246-255)
- **Problem:** The dropzone is a `<div role="button" tabIndex={0}>` with a dashed border using `border-muted-foreground/25`. At 25% opacity the boundary is very faint and may fall below the 3:1 non-text contrast requirement for UI boundaries (WCAG 2.2 1.4.11). Keyboard activation is handled manually for only Enter/Space. The remove-file button (lines 246-255) is an unstyled `<button>` with no `aria-label` and only a 14px icon.
- **Failure scenario:** Low-vision users cannot perceive the dropzone boundary. Keyboard users cannot activate the dropzone with a synthesized click if the manual handler is missed. Screen-reader users cannot tell what the remove button does.
- **Suggested fix:** Increase border contrast to at least `border-muted-foreground/50` or use `border-border`, and add a background change on hover/focus. Replace the custom div with a native `<button>` styled as a block, or add `aria-label` and focus styles. Add `aria-label={t("removeFile")}` to the remove button.
- **Cross-references:** `src/components/ui/button.tsx`

## LOW: Component-level loading skeletons are not announced
**Classification:** LOW | **Confidence:** Medium
- **Files:**
  - `src/components/contest/leaderboard-table.tsx` (lines 109-140)
  - `src/app/(public)/submissions/page.tsx` (data table region)
- **Problem:** Page-level `loading.tsx` files correctly use `role="status" aria-busy="true"` with a skeleton wrapper. However, component-level skeletons (e.g. `SkeletonTable` inside `leaderboard-table.tsx`) render without an `aria-live` or `aria-busy` region, so screen-reader users navigating with the virtual cursor encounter empty table headers with no loading context.
- **Failure scenario:** A screen-reader user lands on the contest leaderboard while data is loading; the table headers are present but the body is blank, and no status announcement explains that results are loading.
- **Suggested fix:** Wrap component-level skeletons in a container with `role="status" aria-busy="true"` and an `aria-label={t("loadingLeaderboard")}`. Reuse the pattern from the page-level `loading.tsx` files.
- **Cross-references:** `src/app/(public)/loading.tsx`, `src/app/(dashboard)/dashboard/loading.tsx`, `src/components/ui/skeleton.tsx`

## LOW: Tooltip provider uses zero delay, which can feel aggressive
**Classification:** LOW | **Confidence:** Low
- **File:** `src/components/ui/tooltip.tsx` (lines 7-15)
- **Problem:** `TooltipProvider` defaults `delay={0}`, so tooltips appear instantly on hover. This can create a busy/flickering interface for users with tremor or magnification, and can obscure adjacent controls. No caller overrides the delay.
- **Failure scenario:** A user with hand tremor moving the cursor across a toolbar icon row sees a rapid sequence of tooltip overlays, making it hard to click the intended icon.
- **Suggested fix:** Change the default to a small delay such as `delay={200}`. Ensure all icon-only triggers still keep their `aria-label` so accessibility does not depend on the tooltip.
- **Cross-references:** `src/components/layout/theme-toggle.tsx`, `src/components/layout/locale-switcher.tsx`, `src/components/submission-status-badge.tsx`

## LOW: Analytics SVG inline percentage text may fail contrast and lacks accessible name
**Classification:** LOW | **Confidence:** Medium
- **File:** `src/components/contest/analytics-charts.tsx` (lines 222-293)
- **Problem:** `SVGStackedBar` uses white text (`fill-white`) directly on the `fill-yellow-500` partial segment. The contrast between white and yellow-500 is estimated below 3:1, so the inline percentage can be hard to read. The `<svg>` has `role="img"` but no `aria-label`, and `<title>` tooltips inside SVG are not consistently exposed to all screen readers. A visible legend is present in the parent card (lines 611-623), but the SVG itself has no programmatic name.
- **Failure scenario:** Sighted users with low contrast sensitivity cannot read the partial-segment percentage. Screen-reader users may hear the SVG as an unnamed image.
- **Suggested fix:** Use dark text on the yellow partial segment (e.g. `fill-yellow-950`) or choose a darker yellow. Add `aria-label` to the SVG summarizing the bar, and add a hidden table fallback or `role="img" aria-roledescription="chart"`.
- **Cross-references:** `src/components/contest/contest-statistics.tsx`

## LOW: Small icon-only touch targets fall below the recommended 44x44 CSS pixels
**Classification:** LOW | **Confidence:** Medium
- **Files:**
  - `src/components/code/copy-code-button.tsx` (line 35)
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx` (lines 502-516)
  - `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx` (line 477)
  - `src/app/(dashboard)/dashboard/admin/tags/tag-form-fields.tsx` (lines 57-75)
- **Problem:** Several icon-only buttons are sized at 28px (`h-7 w-7`, `size-7`) or 32px (`size-8`). The WCAG 2.2 2.5.5 Target Size (Enhanced) recommends 44x44 CSS pixels for pointer targets, and the iOS HIG / Material guidelines agree.
- **Failure scenario:** Users with motor impairments or coarse pointers may miss the button or activate an adjacent control.
- **Suggested fix:** Increase the hit area to at least 44x44px while keeping the visual icon the same size, or use the touch-target pattern already applied in `theme-toggle.tsx` and `locale-switcher.tsx` (`size-11` on mobile shrinking to `size-9` on desktop).
- **Cross-references:** `src/components/ui/button.tsx`

## LOW: Active navigation links lack `aria-current`
**Classification:** LOW | **Confidence:** High
- **File:** `src/components/layout/public-header.tsx` (lines 180-196)
- **Problem:** The desktop navigation highlights the active page with visual styles (`bg-accent text-accent-foreground`) but does not add `aria-current="page"`. Screen-reader users browsing the navigation cannot tell which page is active without inferring it from the visual style.
- **Failure scenario:** A screen-reader user opens the navigation rotor and hears a list of links with no indication of the current page.
- **Suggested fix:** Add `aria-current={active ? "page" : undefined}` to each navigation `<Link>`.
- **Cross-references:** `src/components/pagination-controls.tsx` (already uses `aria-current` correctly)

## LOW: `SelectValue` label contract is not enforced by the design-system wrapper
**Classification:** LOW | **Confidence:** High
- **File:** `src/components/ui/select.tsx` (lines 21-29)
- **Problem:** `SelectValue` accepts arbitrary children and does not require an explicit label. `AGENTS.md` documents the contract that callers must render selected labels as static children, but the component itself does not prevent misuse (compile-time or runtime). The existing unit test only guards a subset of known risky call sites.
- **Failure scenario:** A future contributor adds a new `<Select>` and leaves `<SelectValue />` empty or passes an option object; users see raw IDs or `[object Object]` in the trigger.
- **Suggested fix:** Add a development-only runtime warning when `SelectValue` renders with empty/object children, or provide a `renderValue` prop on `Select` that derives the label from the selected option and make explicit `SelectValue` optional.
- **Cross-references:** `AGENTS.md`, `tests/unit/select-value-contract-implementation.test.ts`

---

## Final sweep

### Positive findings worth preserving
- Korean letter-spacing overrides are consistently applied via conditional `locale !== "ko"` classes and documented inline (`src/app/globals.css`, not-found pages, public headers, contest access codes).
- `next-themes` plus CSS custom properties provides a robust dark/light/system theming foundation.
- Skip-to-content link, `aria-expanded`/`aria-controls` on the public header mobile menu, and focus restoration on menu close are already implemented.
- The CodeMirror fullscreen overlay is a focus-managed modal dialog with `role="dialog"`, `aria-modal="true"`, a Tab trap, and focus restore on close (guarded by `tests/unit/a11y-review-fixes-implementation.test.ts`).
- Form validation UX in `signup-form.tsx` correctly uses `aria-invalid` and `aria-describedby` for field-level errors.
- Page-level `loading.tsx` files use `role="status"` and `aria-label` for loading announcements.
- The locale switcher and theme toggle intentionally use 44x44px touch targets on mobile.

### Items that need manual verification
- Exact contrast ratios for `text-yellow-600`, `text-amber-600`, `border-muted-foreground/25`, and `fill-white` on `fill-yellow-500` should be verified with a contrast analyzer against the rendered CSS custom properties in both light and dark modes.
- Screen-reader behavior for Base UI `DialogPrimitive.Close` with `render` + `sr-only` children should be confirmed with NVDA/VoiceOver to determine whether the label is duplicated or one source wins.
- Focus management and Tab trapping inside the CodeMirror fullscreen overlay should be validated with a manual keyboard walkthrough.
- Actual touch-target sizes on mobile for the problem-detail action bar, sidebar collapse affordances, and small admin icon buttons should be measured against the 44x44 CSS-pixel recommendation.
- Color-blind usability of the analytics stacked bar, tier badges, and anti-cheat event badges should be checked with a simulator; several rely on color alone or use low-contrast tinted backgrounds.

### Runtime inspection note
Browser-based inspection was attempted but abandoned: the Next.js standalone server boots, but the instrumentation hook requires `DATABASE_URL` and a reachable PostgreSQL database, so pages cannot be rendered. All findings above are therefore derived from source-code analysis and should be validated in a running environment once a database is available.
