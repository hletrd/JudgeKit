# UI/UX Design Review

Date: 2026-06-30
Scope: entire repository (Next.js app, design system, components, public/dashboard/auth pages, tests)
Summary: The design system is well-structured and already guards several accessibility regressions via unit tests (keyboard trap escape, select value labels, diff +/- cues, focus management). However, there are recurring gaps around programmatic labelling, WCAG contrast, single-key keyboard shortcuts, and form error association. No CRITICAL issues were found.
Findings count: 12

## MEDIUM: Dialog and Sheet close buttons expose a duplicate accessible name (confidence: High)
- **File**: `src/components/ui/dialog.tsx` (line 56-67)
- **File**: `src/components/ui/sheet.tsx` (line 58-69)
- **Problem**: The Base UI `DialogPrimitive.Close` uses a `render` prop pointing to a `Button` that already carries `aria-label={tCommon("close")}`. The same `<DialogPrimitive.Close>` then has children `<XIcon aria-hidden="true" />` plus `<span className="sr-only">{tCommon("close")}</span>`. Depending on Base UI's label-derivation behavior, this either duplicates the word "close" for screen-reader users or leaves the `Button` with a label while the inner text is ignored. It also makes the accessible label brittle if the two strings ever diverge.
- **Failure scenario**: A screen-reader user opening a sheet/dialog hears "close close button" (NVDA/JAWS) or gets an inconsistent label, especially when a dialog title is not programmatically associated with the dialog via `aria-labelledby`.
- **Suggested fix**: Remove the explicit `aria-label` from the `Button` in the `render` prop and let the `sr-only` children inside `DialogPrimitive.Close` provide the label. Alternatively, keep the `aria-label` and render `<XIcon aria-hidden="true" />` only, with no inner `sr-only` text. Also ensure `DialogContent` forwards an `aria-labelledby` attribute to the Base UI `DialogPopup` pointing at `DialogTitle`.
- **Cross-references**: `src/components/ui/dialog.tsx`, `src/components/ui/sheet.tsx`, `src/components/ui/button.tsx`, `tests/unit/a11y-review-fixes-implementation.test.ts`

## MEDIUM: Tab panels lack programmatic labels on nested tab sets (confidence: High)
- **File**: `src/app/(public)/practice/problems/[id]/page.tsx` (line 114-164 region)
- **File**: `src/app/(public)/problems/[id]/page.tsx` (line 188-238 region)
- **File**: `src/components/submissions/output-diff-view.tsx` (line 74-104 region)
- **Problem**: When multiple `<Tabs>` instances exist on the same page, Base UI renders them with the same generic tablist semantics unless each receives a unique `aria-label`. The problem page contains a top-level `Tabs defaultValue="problem"` and an inner `Tabs defaultValue="questions"` inside the "discussion" tab. Neither is labelled, so a screen-reader user cannot distinguish "problem / submissions / discussion" from "questions / leaderboard".
- **Failure scenario**: VoiceOver/NDVA rotor lists two tablists both reading as "tab group, 3 items"; the user cannot tell which tablist controls problem sections and which controls discussion sub-sections. Voice-control users also cannot target a tab by a meaningful name.
- **Suggested fix**: Add `aria-label` (or `aria-labelledby`) to each `<Tabs>` root. For example: `<Tabs defaultValue="problem" aria-label={t("problemSections")}>`. In `output-diff-view.tsx` add `aria-label={t("diffViews")}` to the expected/actual tabs.
- **Cross-references**: `src/components/ui/tabs.tsx`, `src/app/(public)/practice/problems/[id]/page.tsx`, `src/components/submissions/output-diff-view.tsx`

## MEDIUM: `text-yellow-600` on white likely fails WCAG AA contrast (confidence: High)
- **File**: `src/app/(public)/_components/public-problem-list.tsx` (line 163)
- **File**: `src/components/contest/leaderboard-table.tsx` (line 98)
- **File**: `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx` (line 479, 484)
- **Problem**: Tailwind `text-yellow-600` on a white background has an estimated contrast ratio around 3.5:1–4.0:1 (below the 4.5:1 required for normal-size body text under WCAG 2.2 1.4.3). The success-rate indicator, first-place rank, and image-status badges all rely on this yellow, so low-vision users may miss the difference between success-rate tiers or rank highlights.
- **Failure scenario**: A user with low contrast sensitivity cannot distinguish "50%" success rate from "80%" success rate in the public problem list, or cannot identify first place on the leaderboard.
- **Suggested fix**: Move to a darker yellow such as `text-yellow-700`/`amber-700` (targeting ≥4.5:1 on white) or add a non-color cue (icon, weight, underline). In dark mode `dark:text-yellow-400` appears acceptable on the dark surface and can be kept.
- **Cross-references**: `tests/unit/a11y-review-fixes-implementation.test.ts` (guards only `problem-submission-form.tsx` and `compiler-client.tsx` yellow usage), `src/app/globals.css`

## MEDIUM: Single-key "n"/"p" shortcuts conflict with screen-reader reading keys (confidence: Medium)
- **File**: `src/components/problem/problem-keyboard-nav.tsx` (line 26-34)
- **Problem**: The component registers unmodified `n` and `p` keys to navigate to the next/previous problem. These keys are commonly used by NVDA and JAWS for next/previous paragraph and by VoiceOver users typing by voice. There is no documented mechanism to disable or remap these shortcuts, and the focus does not visibly move to the new problem's heading after navigation.
- **Failure scenario**: A screen-reader user pressing "p" to read the previous paragraph is unexpectedly navigated to the previous problem; focus lands in an unknown location and the page context is lost.
- **Suggested fix**: Require a modifier (`Alt`/`Ctrl`/`Cmd`) for problem navigation, e.g. `Alt+n` / `Alt+p`, or provide a user preference to disable single-key shortcuts. After navigation, programmatically move focus to the top of the new problem content (`#main-content` or the problem heading) and announce the change via an `aria-live` region.
- **Cross-references**: `src/app/(public)/practice/problems/[id]/page.tsx`, `src/app/(public)/problems/[id]/page.tsx`, `tests/unit/a11y-review-fixes-implementation.test.ts`

## MEDIUM: Login form errors are not programmatically associated with inputs (confidence: High)
- **File**: `src/app/(auth)/login/login-form.tsx` (line 76-81)
- **Problem**: When login fails, the error is rendered inside `<p role="alert" aria-live="polite">`. The email/password inputs do not receive `aria-invalid="true"`, and none are linked to the alert via `aria-describedby`. The summary also lacks a list of which field failed, so the user only sees a generic "Invalid credentials" message.
- **Failure scenario**: A screen-reader user tabs to the email field after a failed login and has no programmatic indication that the field is invalid or that it relates to the alert text. Magnifier users may not notice the alert if it appears above the submit button outside the zoomed viewport.
- **Suggested fix**: Add `aria-invalid={!!error}` and `aria-describedby="login-error"` to both inputs, and give the alert paragraph `id="login-error"`. For server-returned field-specific errors (e.g. "email not verified"), expose them on the relevant field.
- **Cross-references**: `src/app/(auth)/signup/signup-form.tsx` (does this correctly with `aria-invalid` and `aria-describedby`), `src/components/ui/input.tsx`

## MEDIUM: Contest join success spinner relies on color-only status and has no live-region announcement (confidence: Medium)
- **File**: `src/app/(public)/contests/join/contest-join-client.tsx` (line 101-105)
- **Problem**: After a successful join, the UI shows a green `CheckCircle2` icon with `animate-pulse` plus green success text, but there is no `aria-live` announcement. The redirect is delayed by a timer; during that interval a screen-reader user hears nothing.
- **Failure scenario**: A screen-reader user submits the form, hears the button revert to its default state, and receives no confirmation that the join succeeded before the redirect occurs.
- **Suggested fix**: Wrap the success message in a container with `role="status" aria-live="polite"` and ensure focus is moved to the success message when `success` becomes true. Reduce or make configurable the auto-redirect delay so users have enough time to hear the confirmation.
- **Cross-references**: `src/app/(public)/contests/join/contest-join-client.tsx`, `src/components/ui/sonner.tsx`

## LOW: `SelectValue` label contract is not enforced by the design-system API (confidence: High)
- **File**: `src/components/ui/select.tsx` (line 59-87)
- **File**: `src/components/ui/select.tsx` (line 100-113)
- **Problem**: `SelectValue` accepts arbitrary children and does not require an explicit label. If a caller renders `<SelectValue>{item.id}</SelectValue>` rather than `<SelectValue>{item.label}</SelectValue>`, the trigger shows a raw identifier. AGENTS.md documents this as a known risk and a unit test guards the "risky" call sites, but the component itself does not prevent misuse.
- **Failure scenario**: A future contributor adds a new `<Select>` for user roles or languages and passes the raw ID as `SelectValue`; users see opaque UUIDs or numeric IDs in the trigger.
- **Suggested fix**: Add a development-only runtime warning or TypeScript enforcement that `SelectValue` children must be a string/number (not a raw option object). Alternatively, provide a `renderValue` prop on `Select` that derives the label from the selected option and make `SelectValue` optional.
- **Cross-references**: `AGENTS.md`, `tests/unit/select-value-contract-implementation.test.ts`

## LOW: File upload dropzone border may be too faint for low-vision users (confidence: Medium)
- **File**: `src/components/ui/file-upload.tsx` (line 88)
- **Problem**: The dropzone uses `border-dashed border-2 border-muted-foreground/25`. At 25% opacity the border color is a very light gray on a white/light surface, likely falling below the 3:1 non-text contrast requirement for UI boundaries (WCAG 2.2 1.4.11).
- **Failure scenario**: Users with low vision cannot perceive the dropzone boundary and may not know where to drop a file or click to open the file picker.
- **Suggested fix**: Increase border contrast to at least `border-muted-foreground/50` or use a solid `border-border` color. Add a background change on hover/focus and a clear text label to reinforce the boundary.
- **Cross-references**: `src/components/ui/file-upload.tsx`, `src/app/globals.css`

## LOW: Loading skeletons for dynamic content are not consistently announced (confidence: Medium)
- **File**: `src/components/contest/leaderboard-table.tsx` (line 109-140)
- **File**: `src/app/(public)/submissions/page.tsx` (line 30-50 region)
- **Problem**: Many full-page `loading.tsx` files use `role="status" aria-busy="true"` with a `Skeleton` wrapper, which is good. However, component-level skeletons (e.g. `SkeletonTable` inside `leaderboard-table.tsx`) are rendered without any `aria-live` or `aria-busy` region, so screen-reader users navigating with the virtual cursor may encounter empty or partially-styled table headers without context.
- **Failure scenario**: A screen-reader user lands on the contest leaderboard while data is loading; the table headers are present but the body is blank, and no status announcement explains that results are loading.
- **Suggested fix**: Wrap component-level skeletons in a container with `role="status" aria-busy="true"` and an `aria-label={t("loadingLeaderboard")}` or similar. Reuse the pattern from the page-level `loading.tsx` files.
- **Cross-references**: `src/app/(public)/loading.tsx`, `src/app/(dashboard)/dashboard/loading.tsx`, `src/components/ui/skeleton.tsx`

## LOW: `StatusBoard` uses `role="button"` instead of a native button (confidence: Medium)
- **File**: `src/components/contest/status-board.tsx` (line 61-70)
- **Problem**: Each clickable status row is a `<div role="button" tabIndex={0}>` with manual `onKeyDown` handling for Enter/Space. The code comment explains this is to keep the cell as a `<td>`, which is reasonable, but a native `<button>` inside the cell would give users proper disabled semantics, focus rings from the design system, and correct activation behavior for voice control.
- **Failure scenario**: Voice-control users cannot say "click Joined" because the target is a generic `div`. Keyboard users may experience inconsistent activation if an assistive technology synthesizes a click event rather than the expected keydown.
- **Suggested fix**: Replace the outer `div` with a `<button className="... w-full text-left">` (or use `<Button variant="ghost" asChild>` if Base UI/Button supports it) and remove the manual keyboard handler. Ensure focus and disabled states are inherited from the design system.
- **Cross-references**: `src/components/contest/status-board.tsx`, `src/components/ui/button.tsx`

## LOW: Tooltip provider uses zero delay, which can feel aggressive and flicker on hover (confidence: Low)
- **File**: `src/app/layout.tsx` (line 129-134)
- **Problem**: `TooltipProvider` is configured with `delayDuration={0}`. Tooltips appear instantly on hover, which can create a busy/flickering interface for users with tremor or magnification, and can obscure adjacent controls.
- **Failure scenario**: A user with hand tremor moving the cursor across a toolbar icon row sees a rapid sequence of tooltip overlays, making it hard to click the intended icon.
- **Suggested fix**: Use a small delay such as `delayDuration={200}` and consider disabling tooltips for users who prefer reduced motion (`prefers-reduced-motion`). Ensure all icon-only triggers still keep their `aria-label` so accessibility does not depend on the tooltip.
- **Cross-references**: `src/app/layout.tsx`, `src/components/ui/tooltip.tsx`, `src/components/layout/theme-toggle.tsx`, `src/components/layout/locale-switcher.tsx`

## LOW: Analytics charts rely on color for category meaning without persistent text labels (confidence: Medium)
- **File**: `src/components/contest/analytics-charts.tsx` (line 222-293)
- **Problem**: The stacked SVG bar uses green/yellow/red segments for solved/partial/zero. Each segment has a `<title>` tooltip, but there is no visible legend or persistent text label explaining the color mapping. A color-blind user cannot reliably distinguish partial (yellow) from zero (red) depending on the monitor/gamut, and SVG `<title>` content is not exposed to all screen readers consistently.
- **Failure scenario**: A user with deuteranopia/protanopia views the contest analytics and cannot tell whether the red segment means "zero attempts" or "partially solved" because the two colors may appear similar.
- **Suggested fix**: Add a visible legend with text labels ("Solved", "Partial", "Zero") and, ideally, patterned fills or hatching in addition to color. Add `role="img"` plus an `aria-roledescription="chart"` and a hidden table fallback or `aria-label` summarizing the percentages.
- **Cross-references**: `src/components/contest/analytics-charts.tsx`, `src/components/contest/contest-statistics.tsx`

## Final sweep
- **Skipped/needs manual validation**:
  - Actual contrast ratios for `text-yellow-600`, `border-muted-foreground/25`, and `text-muted-foreground` in both light and dark modes should be verified with a contrast analyzer against the final rendered CSS custom properties.
  - Screen-reader behavior for Base UI `DialogPrimitive.Close` with `render` + `sr-only` children was inferred from the component source; confirm with NVDA/VoiceOver that the label is duplicated or that one source wins.
  - Focus management of the CodeMirror fullscreen overlay was covered by existing tests; a manual tab-through is still valuable to ensure the Tab trap does not capture `Ctrl+Tab` browser navigation.
  - Touch targets on mobile for the problem-detail action bar and sidebar collapse affordances were not measured against the 44×44 CSS-pixel WCAG 2.5.5 target-size recommendation.
- **Positive findings worth preserving**:
  - Korean letter-spacing overrides are consistently applied via conditional `locale !== "ko"` classes and documented inline.
  - CodeMirror keyboard-trap mitigation (`Escape` to blur, `indentWithTab`) is present and guarded by a dedicated test.
  - Skip-to-content link, `aria-expanded`/`aria-controls` on the public header mobile menu, and focus restoration on route change are already implemented.
  - `next-themes` + CSS custom properties provide a robust dark/light/system foundation.
