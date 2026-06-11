# RPF Cycle 28 — Designer Review

**Reviewer:** designer agent
**Date:** 2026-04-23
**HEAD:** ca62a45d
**Scope:** Full UI/UX audit of all components and pages

---

## Component Inventory

### Pages (63 routes)

| Route Group | Pages | Purpose |
|---|---|---|
| `(auth)` | `/login`, `/signup`, `/recruit/[token]` | Authentication |
| `(public)` | `/`, `/playground`, `/contests`, `/contests/[id]`, `/submissions`, `/submissions/[id]`, `/rankings`, `/languages`, `/practice`, `/practice/sets`, `/practice/sets/[id]`, `/practice/problems/[id]`, `/practice/problems/[id]/rankings`, `/community`, `/community/threads/[id]`, `/community/new`, `/users/[id]` | Public-facing |
| `(dashboard)` | `/dashboard`, `/dashboard/problems`, `/dashboard/problems/[id]`, `/dashboard/problems/[id]/edit`, `/dashboard/problems/create`, `/dashboard/problem-sets`, `/dashboard/problem-sets/new`, `/dashboard/problem-sets/[id]`, `/dashboard/contests`, `/dashboard/contests/create`, `/dashboard/contests/join`, `/dashboard/contests/[assignmentId]` (+ analytics, participant, timeline, students), `/dashboard/groups`, `/dashboard/groups/[id]` (+ assignments, student, analytics), `/dashboard/submissions`, `/dashboard/submissions/[id]`, `/dashboard/profile`, `/dashboard/admin/users`, `/dashboard/admin/users/[id]`, `/dashboard/admin/roles`, `/dashboard/admin/submissions`, `/dashboard/admin/submissions/[id]`, `/dashboard/admin/languages`, `/dashboard/admin/workers`, `/dashboard/admin/audit-logs`, `/dashboard/admin/login-logs`, `/dashboard/admin/settings`, `/dashboard/admin/files`, `/dashboard/admin/api-keys`, `/dashboard/admin/tags`, `/dashboard/admin/plugins`, `/dashboard/admin/plugins/[id]`, `/dashboard/admin/plugins/chat-logs`, `/dashboard/admin/discussions` | Authenticated dashboard |
| Other | `/change-password` | Standalone |

### Application Components (67 files)

| Module | Components |
|---|---|
| **code** | `code-editor`, `code-editor-skeleton`, `code-surface`, `code-viewer`, `compiler-client`, `copy-code-button`, `shortcuts-help` |
| **contest** | `access-code-manager`, `analytics-charts`, `anti-cheat-dashboard`, `contest-announcements`, `contest-clarifications`, `contest-quick-stats`, `contest-replay`, `contest-statistics`, `export-button`, `invite-participants`, `leaderboard-table`, `code-timeline-panel`, `participant-anti-cheat-timeline`, `participant-timeline-view`, `quick-create-contest-form`, `recruiter-candidates-panel`, `recruiting-invitations-panel`, `score-timeline-chart` |
| **discussions** | `discussion-moderation-list`, `discussion-post-delete-button`, `discussion-post-form`, `discussion-thread-form`, `discussion-thread-list`, `discussion-thread-moderation-controls`, `discussion-thread-view`, `discussion-vote-buttons`, `my-discussions-list` |
| **exam** | `anti-cheat-monitor`, `countdown-timer`, `start-exam-button` |
| **layout** | `active-timed-assignment-sidebar-panel`, `app-sidebar`, `breadcrumb`, `lecture-mode-toggle`, `locale-switcher`, `public-footer`, `public-header`, `skip-to-content`, `theme-toggle`, `vim-scroll-shortcuts` |
| **lecture** | `lecture-mode-provider`, `lecture-problem-view`, `lecture-toolbar`, `submission-overview` |
| **problem** | `accepted-solutions`, `difficulty-range-filter`, `problem-description`, `problem-submission-form`, `public-problem-set-detail`, `public-problem-set-list`, `public-quick-submit`, `structured-problem-statement` |
| **submissions** | `output-diff-view`, `submission-list-auto-refresh`, `submission-status-badge` |
| **user** | `user-stats-dashboard` |
| **shared** | `assistant-markdown`, `destructive-action-dialog`, `empty-state`, `filter-select`, `hash-tabs`, `language-selector`, `nonce-provider`, `pagination-controls`, `seo/json-ld`, `submission-status-badge`, `theme-provider`, `tier-badge` |
| **ui (shadcn)** | `alert-dialog`, `avatar`, `badge`, `button`, `card`, `checkbox`, `collapsible`, `dialog`, `dropdown-menu`, `input`, `label`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `sonner`, `table`, `tabs`, `textarea`, `tooltip` |

---

## Findings

### D-01: Icon-only buttons missing `aria-label` in recruiting invitations panel

**File:** `src/components/contest/recruiting-invitations-panel.tsx:525–586`
**Severity:** High
**Confidence:** High

Multiple icon-only buttons use only `title` attributes instead of `aria-label`:
- Copy link button (line 525–536): `<Button variant="ghost" size="sm" onClick={handleCopyLink} title={t("copyLink")}>`
- Reset password button (line 540): `<Button variant="ghost" size="sm" title={t("resetAccountPassword")}>`
- Revoke button (line 564): `<Button variant="ghost" size="sm" title={t("revoke")}>`
- Delete button (line 585): `<Button variant="ghost" size="sm" title={t("delete")}>`

**WCAG:** 4.1.2 Name, Role, Value (Level A)
**Impact:** Screen readers announce these as unlabeled buttons. `title` is not a substitute for `aria-label` — it is not announced by all screen readers and is not part of the accessible name computation in all contexts.
**Fix:** Add `aria-label` to each icon-only button. Keep `title` as a tooltip for sighted users.

---

### D-02: Icon-only buttons in lecture toolbar missing `aria-label`

**File:** `src/components/lecture/lecture-toolbar.tsx:135–180`
**Severity:** High
**Confidence:** High

Font size decrease/increase buttons (lines 135, 139) and layout buttons (lines 156, 159, 162) are icon-only with only `title` attributes. The color scheme button (line 147) also lacks an `aria-label`.

**WCAG:** 4.1.2 Name, Role, Value (Level A)
**Impact:** Screen reader users cannot determine the purpose of these toolbar buttons.
**Fix:** Add `aria-label` to all icon-only buttons in the toolbar.

---

### D-03: Fullscreen editor toggle buttons missing `aria-label`

**File:** `src/components/code/code-editor.tsx:92–117`
**Severity:** Medium
**Confidence:** High

Both the enter-fullscreen (line 92–100) and exit-fullscreen (line 108–117) buttons are icon-only and lack `aria-label`. They use only `title` attributes ("Fullscreen (F) · Exit (Esc)", "Exit fullscreen (Esc)").

**WCAG:** 4.1.2 Name, Role, Value (Level A)
**Impact:** Screen reader users cannot identify these controls.
**Fix:** Add `aria-label` to both buttons.

---

### D-04: Submission overview is not a dialog — missing focus trap and ARIA

**File:** `src/components/lecture/submission-overview.tsx:138–207`
**Severity:** High
**Confidence:** High

The submission overview renders as a `fixed` positioned panel (line 139) that overlays the page, but it is not wrapped in a Dialog component. It lacks:
- `role="dialog"` and `aria-modal="true"`
- Focus trap (keyboard focus can escape to the underlying page)
- Focus restoration when closed
- Escape key to close

**WCAG:** 2.1.2 No Keyboard Trap (Level A) — paradoxically, it's the *absence* of a trap that's the problem here. Also 4.1.2 (role not communicated).
**Impact:** Keyboard and screen reader users have no way to understand this is a modal overlay. Tab key navigates away into the hidden page content.
**Fix:** Wrap in the existing Dialog component or add `role="dialog"`, `aria-modal`, focus trap, and Escape key handling.

---

### D-05: Anti-cheat privacy notice overlay missing dialog semantics

**File:** `src/components/exam/anti-cheat-monitor.tsx:252–277`
**Severity:** Medium
**Confidence:** High

The privacy notice renders as a full-screen overlay (`fixed inset-0 z-60`, line 254) but is a plain `<div>` with no dialog ARIA. It lacks:
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- Focus trap (user can Tab out of the overlay)
- No programmatic association between heading and dialog

**WCAG:** 4.1.2 Name, Role, Value (Level A)
**Impact:** Screen reader users don't know they're in a modal context. Keyboard users can navigate to content behind the overlay.
**Fix:** Wrap in Dialog or add `role="dialog"`, `aria-modal`, and focus trap.

---

### D-06: Hardcoded color classes bypass dark mode theme tokens

**File:** `src/components/lecture/submission-overview.tsx:153–196`
**Severity:** Medium
**Confidence:** High

Multiple hardcoded Tailwind color classes are used instead of semantic theme tokens:
- `text-green-500` (lines 153, 163) — accepted percentage and icon
- `text-red-500` (lines 167, 196) — wrong answer icon and status text
- `text-orange-500` (line 171) — compile error icon
- `text-yellow-500` (line 175) — time limit icon
- `text-blue-500` (lines 175, 195) — pending/judging indicators
- `bg-green-500` (lines 157, 163) — progress bar and acceptance bar

These colors are not guaranteed to have sufficient contrast in both light and dark modes against their respective backgrounds. For example, `text-green-500` on a `bg-background` may fail WCAG 2.1 1.4.3 (minimum contrast 4.5:1 for normal text) depending on the theme.

**WCAG:** 1.4.3 Contrast (Minimum) (Level AA) — potential failure in dark mode
**Impact:** Low-contrast text is difficult to read for users with low vision or in bright environments.
**Fix:** Use semantic tokens like `text-green-600 dark:text-green-400` (with verified contrast ratios) or define semantic CSS variables for status colors.

---

### D-07: Hardcoded color classes in leaderboard table

**File:** `src/components/contest/leaderboard-table.tsx:84–100, 307, 461–464`
**Severity:** Medium
**Confidence:** Medium

Rank icons and text use hardcoded colors:
- `text-yellow-500`, `text-slate-400`, `text-amber-600` (lines 84–86) — trophy icons
- `text-yellow-600 dark:text-yellow-400`, `text-slate-500 dark:text-slate-300`, `text-amber-700 dark:text-amber-500` (lines 98–100) — rank numbers
- ICPC cell status colors: `text-green-700 dark:text-green-400`, `text-blue-700 dark:text-blue-400`, `text-red-700 dark:text-red-400` (lines 461–464)
- Frozen badge: hardcoded blue palette (line 307)

While the dark mode variants are present for most, the light mode `text-slate-400` (silver trophy, line 85) on white backgrounds likely fails WCAG 1.4.3 contrast requirements (approximate ratio 2.9:1 for slate-400 on white).

**WCAG:** 1.4.3 Contrast (Minimum) (Level AA)
**Impact:** Silver trophy icon is nearly invisible for users with low vision on light backgrounds.
**Fix:** Increase light-mode contrast: `text-slate-500` or `text-slate-600` for silver trophy.

---

### D-08: Anti-cheat timeline/dashboard hardcoded colors without dark mode handling

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:36–42`
**File:** `src/components/contest/anti-cheat-dashboard.tsx:76–88`
**Severity:** Medium
**Confidence:** High

Event type badge colors are hardcoded with separate light/dark variants (e.g., `bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400`). While dark mode is handled, the color mapping is duplicated across both files (identical strings on lines 36–42 of timeline and 76–82 of dashboard). This violates DRY and could drift.

Additionally, `dark:text-gray-400` on `dark:bg-gray-900/30` (lines 39–40 in timeline) may have insufficient contrast.

**WCAG:** 1.4.3 Contrast (Minimum) (Level AA) — potential dark mode failure
**Impact:** Low-contrast badge text in dark mode for `blur` and `contextmenu` event types.
**Fix:** Extract the event type color map into a shared utility. Verify dark mode contrast ratios for `dark:text-gray-400` on `dark:bg-gray-900/30`.

---

### D-09: Compiler client hardcoded colors for error/warning states

**File:** `src/components/code/compiler-client.tsx:525, 530, 563, 570`
**Severity:** Low
**Confidence:** Medium

- `text-yellow-600` (line 525) — timed out label
- `text-red-600` (lines 530, 563, 570) — compile error label and stderr output

These lack `dark:` variants, so in dark mode they rely on browser default rendering of `text-red-600` on the background, which may have poor contrast. `text-red-600` (#dc2626) on a typical dark background (#0a0a0a) has ~4.8:1 contrast — borderline passing for AA but failing for AAA large text.

**WCAG:** 1.4.6 Contrast (Enhanced) (Level AAA) — potential failure
**Impact:** Reduced readability of error messages in dark mode.
**Fix:** Add `dark:text-red-400` or `dark:text-red-500` variants for better dark mode contrast.

---

### D-10: `animate-pulse` on countdown timer has no reduced-motion consideration

**File:** `src/components/exam/countdown-timer.tsx:35`
**Severity:** Medium
**Confidence:** High

The `animate-pulse` class is applied via the `getTextColor` function when remaining time < 1 minute. While `globals.css:138` has a `prefers-reduced-motion: reduce` media query that sets `animation-duration: 0.01ms`, the pulse animation creates visual noise that could distract users with vestibular disorders even at reduced duration. More importantly, the blinking effect itself may not be desirable for some users regardless of the CSS override.

**WCAG:** 2.3.3 Animation from Interactions (Level AAA)
**Impact:** Pulsing countdown in the final minute can cause discomfort for users sensitive to animation.
**Fix:** Consider replacing `animate-pulse` with a static color change (e.g., just `text-destructive`) or using a subtler non-animated visual indicator. The CSS override in globals.css partially addresses this but the pulse class is still semantically present.

---

### D-11: Discussion thread delete action has no confirmation dialog

**File:** `src/components/discussions/discussion-thread-moderation-controls.tsx:92`
**Severity:** High
**Confidence:** High

The "Delete thread" button (line 92) calls `deleteThread()` directly with no confirmation dialog. This is a destructive, irreversible action (deleting an entire thread with all replies) but has no guard against accidental clicks.

Meanwhile, `discussion-post-delete-button.tsx` correctly uses `DestructiveActionDialog` for individual post deletion.

**Impact:** An accidental click on the delete button permanently destroys an entire discussion thread with all its replies. Users have no chance to cancel.
**Fix:** Wrap the delete button in `DestructiveActionDialog` or `AlertDialog`, consistent with the post deletion pattern.

---

### D-12: Recruiting invitations table action buttons use `title` only for accessibility

**File:** `src/components/contest/recruiting-invitations-panel.tsx:525–603`
**Severity:** High
**Confidence:** High

All action buttons in the table (Copy Link, Reset Password, Revoke, Delete) are icon-only buttons that use `title` attributes but lack `aria-label`. This is the same issue as D-01 but specifically called out for the table action pattern.

**WCAG:** 4.1.2 Name, Role, Value (Level A)
**Impact:** Screen readers announce these as unnamed buttons; screen reader users cannot distinguish between the different actions in each row.
**Fix:** Add `aria-label` to each button. Example: `<Button variant="ghost" size="sm" onClick={...} aria-label={t("copyLink")} title={t("copyLink")}>`

---

### D-13: Stdin toggle button in problem submission form missing `aria-expanded`

**File:** `src/components/problem/problem-submission-form.tsx:339–346`
**Severity:** Medium
**Confidence:** High

The stdin collapsible toggle button (line 339) has no `aria-expanded` or `aria-controls` attribute. Screen reader users cannot determine whether the stdin section is open or closed.

```tsx
<button
  type="button"
  className="flex items-center gap-1 text-sm text-muted-foreground..."
  onClick={() => setStdinOpen((prev) => !prev)}
>
```

**WCAG:** 4.1.2 Name, Role, Value (Level A)
**Impact:** Screen reader users cannot determine the expanded/collapsed state of the stdin input.
**Fix:** Add `aria-expanded={stdinOpen}` and `aria-controls="stdin-section"` with a matching `id` on the Textarea wrapper.

---

### D-14: Submission overview panel not responsive on small screens

**File:** `src/components/lecture/submission-overview.tsx:139`
**Severity:** Medium
**Confidence:** Medium

The submission overview panel uses `fixed right-4 top-16 z-50 w-80` (line 139), a fixed width of 320px. On screens narrower than ~375px (small mobile), this panel will overflow the viewport and partially obscure content.

**Impact:** On small mobile devices, the stats panel covers too much of the screen, making it impossible to view the underlying content.
**Fix:** Use responsive width: `w-72 sm:w-80` or `max-w-[calc(100vw-2rem)]` to ensure the panel fits within the viewport.

---

### D-15: Recruiting invitations stats grid not responsive

**File:** `src/components/contest/recruiting-invitations-panel.tsx:352`
**Severity:** Low
**Confidence:** High

The stats grid uses `grid grid-cols-5 gap-3` (line 352). On mobile screens, 5 equal columns will be very cramped with tiny text.

**Impact:** Stats cards become unreadable on mobile — numbers and labels are compressed into narrow columns.
**Fix:** Use `grid grid-cols-3 sm:grid-cols-5 gap-3` or `grid grid-cols-2 sm:grid-cols-5 gap-2`.

---

### D-16: Loading state in recruiting invitations uses plain text instead of skeleton

**File:** `src/components/contest/recruiting-invitations-panel.tsx:497`
**Severity:** Low
**Confidence:** High

While loading, the invitations table shows a plain `<p>` tag with "Loading..." text (line 497). Other data-heavy components like the leaderboard (`leaderboard-table.tsx:109–162`) use proper skeleton UI for loading states, providing a better perceived performance experience.

```tsx
{loading ? (
  <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
) : ...
```

**Impact:** Jarring layout shift when data loads; the plain text loading indicator doesn't communicate the expected layout, making the content feel slower to arrive.
**Fix:** Replace with a skeleton table matching the actual table structure, or at minimum use the `Skeleton` component for rows.

---

### D-17: Empty state for invitations uses plain `<p>` instead of `EmptyState` component

**File:** `src/components/contest/recruiting-invitations-panel.tsx:499`
**Severity:** Low
**Confidence:** High

The empty state (line 499) renders a plain `<p>` tag, while a reusable `EmptyState` component exists in `src/components/empty-state.tsx`. Using the shared component would provide a consistent empty-state experience across the app with an icon, title, description, and optional action.

**Impact:** Inconsistent visual design for empty states; no visual affordance (icon) or call-to-action for the user.
**Fix:** Use the `<EmptyState>` component with an appropriate icon and action.

---

### D-18: Vote buttons use Unicode arrows that may not render consistently

**File:** `src/components/discussions/discussion-vote-buttons.tsx:74–86`
**Severity:** Low
**Confidence:** Medium

The upvote/downvote buttons use Unicode characters `▲` and `▼` (lines 74, 82). These characters:
1. May render at inconsistent sizes across browsers and OSes
2. Are not localized (could be replaced with icons for consistency)
3. May not align well with the adjacent text in all fonts

**Impact:** Minor visual inconsistency; functional but not as polished as using SVG icons (like the `ChevronUp`/`ChevronDown` from lucide-react used elsewhere).
**Fix:** Replace with `ChevronUp`/`ChevronDown` icons from lucide-react for consistency with the rest of the icon system.

---

### D-19: Countdown timer `role="timer"` has limited screen reader support

**File:** `src/components/exam/countdown-timer.tsx:145`
**Severity:** Low
**Confidence:** High

The `role="timer"` (line 145) is used on the countdown badge. While this is semantically correct, `role="timer"` is a live region role that has inconsistent support across screen readers. The component already includes `aria-live="assertive"` for threshold announcements (line 151), which is good.

However, the actual countdown value updating every second is not announced (correctly — it would be overwhelming). But the initial value is never announced to screen reader users when the component mounts. A new screen reader user navigating to the timer would need to explicitly query it.

**Impact:** Screen reader users may not be aware of the time remaining when they first focus the component.
**Fix:** Add an `aria-label` to the Badge that includes the current time, e.g., `aria-label={t("timeRemaining", { time: formatCountdown(remaining) })}`. Update this label when the value changes (the sr-only live region already handles threshold announcements).

---

### D-20: Active timed assignment sidebar panel lacks `aria-label` on progress bar

**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:170`
**Severity:** Low
**Confidence:** High

The progress bar div has `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` (line 170), but lacks an `aria-label` or `aria-labelledby` to describe what the progress bar represents.

**WCAG:** 4.1.2 Name, Role, Value (Level A)
**Impact:** Screen readers announce the progress percentage but not what it represents.
**Fix:** Add `aria-label={tNav("progress")}` to the progress bar div.

---

### D-21: File upload button in submission form has no visible label association

**File:** `src/components/problem/problem-submission-form.tsx:282–297`
**Severity:** Low
**Confidence:** Medium

The hidden file input (line 282) is visually associated with the "Upload Source File" button (line 290), but there's no programmatic connection. The button uses `onClick` to trigger the hidden input via ref. While functional, the file input has no associated label for assistive technology.

**Impact:** Screen readers may not identify the purpose of the file input element.
**Fix:** The current approach (hidden input + button trigger) is an acceptable pattern if the button itself has a visible text label (which it does). Low priority — the button's text content serves as the accessible name.

---

### D-22: HashTabs URL hash update lacks screen reader announcement

**File:** `src/components/hash-tabs.tsx:25–28`
**Severity:** Low
**Confidence:** Medium

When a tab is selected, `handleChange` updates the URL hash via `window.history.replaceState` (line 28). This is a silent navigation change that is not announced to screen readers. Users who rely on screen readers may not be aware that the URL changed, making it harder to share or bookmark specific tab states.

**Impact:** Minor — URL hash is primarily a convenience feature for sharing/bookmarking, not a primary navigation mechanism.
**Fix:** No immediate fix needed. Consider whether URL hash changes warrant an `aria-live` announcement for the selected tab name.

---

### D-23: Compiler client "Show full output" button text is hardcoded English

**File:** `src/components/code/compiler-client.tsx:112`
**Severity:** Medium
**Confidence:** High

The truncated output component contains hardcoded English strings:
- `"Show full output"` (line 112)
- `"(empty)"` (line 100)
- `"... (output truncated)"` (line 106)

These strings are not internationalized, while the rest of the compiler client uses `useTranslations("compiler")`.

**Impact:** Non-English users see a mix of localized and English text in the output display area.
**Fix:** Replace with `t("showFullOutput")`, `t("empty")`, and `t("outputTruncated")` i18n keys.

---

### D-24: `buildDefaultTestCaseName` returns hardcoded English string

**File:** `src/components/code/compiler-client.tsx:90–92`
**Severity:** Low
**Confidence:** High

`buildDefaultTestCaseName` returns `TC ${index}` — a hardcoded English abbreviation for "Test Case". The `t("testCaseLabel")` translation exists (line 454) but is not used for the tab name.

**Impact:** Test case tab names are always in English even when the rest of the UI is localized.
**Fix:** Pass the translation function and use `t("testCaseName", { number: index })` or similar.

---

### D-25: Discussion thread moderation controls — delete has no confirmation

**File:** `src/components/discussions/discussion-thread-moderation-controls.tsx:92`
**Severity:** High
**Confidence:** High

(Duplicate of D-11 for emphasis.) The delete thread button directly invokes `deleteThread()` without any confirmation. This is the most destructive moderation action (irreversible, destroys an entire thread with all posts) yet has less protection than the post deletion, which uses `DestructiveActionDialog`.

**Fix:** Wrap in `DestructiveActionDialog` or `AlertDialog`.

---

### D-26: Image in sidebar header uses `alt=""` for decorative site icon

**File:** `src/components/layout/app-sidebar.tsx:185`
**Severity:** Low
**Confidence:** High

The site icon `<Image>` uses `alt=""` (line 185), which is correct for a decorative image when the site title text immediately follows it. However, if the icon were the *only* way to identify the site (e.g., in a collapsed sidebar), users would lose that information. The adjacent text `<span>{siteTitle}</span>` on line 197 provides the name.

**Impact:** None for current layout; the site title text serves as the accessible name.
**Fix:** No fix needed — `alt=""` is correct here since the image is decorative alongside visible text.

---

### D-27: Pagination ellipsis missing `aria-label` or screen reader text

**File:** `src/components/pagination-controls.tsx:109–114`
**Severity:** Low
**Confidence:** High

The pagination ellipsis (`...`) is rendered as a `<span>` (line 109). Screen readers will announce this as nothing or as "dot dot dot", which is not meaningful. The component should include a hidden label like `aria-label={t("paginationEllipsis")}` or use `aria-hidden="true"` with a sr-only explanation.

**Impact:** Screen reader users hear meaningless "..." or silence instead of an explanation that pages are omitted.
**Fix:** Add `aria-hidden="true"` to the `<span>` and add a `<span className="sr-only">{t("paginationEllipsis")}</span>` inside it.

---

## Positive Observations

The codebase demonstrates several strong UI/UX practices:

1. **Skip-to-content link** (`src/components/layout/skip-to-content.tsx`) — properly implemented with `sr-only focus:not-sr-only` pattern and dark mode support.

2. **Reduced motion support** (`src/app/globals.css:138–145`) — comprehensive `prefers-reduced-motion: reduce` override that kills animations, transitions, and scroll behavior.

3. **Mobile menu accessibility** (`src/components/layout/public-header.tsx`) — thorough focus management: focus trap, Escape to close, focus restoration to toggle button, `aria-expanded`, `aria-controls`, and `aria-live` announcements.

4. **Korean letter spacing** — correctly handled across multiple components with locale-aware conditional classes (e.g., `locale !== "ko" ? " tracking-wider" : ""`), respecting the project's CLAUDE.md rule.

5. **Destructive action dialog** (`src/components/destructive-action-dialog.tsx`) — well-implemented reusable component with loading states, sr-only announcements, and proper confirmation flow.

6. **Countdown timer** (`src/components/exam/countdown-timer.tsx`) — includes `aria-live="assertive"` for threshold announcements, server time sync to prevent drift, and `role="timer"`.

7. **Consistent i18n** — nearly all user-facing strings use `useTranslations()` throughout the application components.

8. **Focus visible ring** — consistent use of `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` across interactive elements in the public header and pagination controls.

9. **Active timed assignment sidebar panel** — progress bar uses proper ARIA (`role="progressbar"`, `aria-valuemin/max/now`), timer stops when all deadlines pass to avoid unnecessary CPU usage.

---

### D-28: Badge filter chips with onClick are not keyboard accessible

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:207–219`
**File:** `src/components/contest/anti-cheat-dashboard.tsx:419–432`
**Severity:** High
**Confidence:** High

Badge elements with `onClick` handlers and `cursor-pointer` class render as `<div>` elements. They have no `role="button"`, no `tabIndex` (not keyboard focusable), and no `onKeyDown` handler. Keyboard users cannot activate these filters at all.

```tsx
<Badge
  variant={typeFilter === null ? "default" : "outline"}
  className="cursor-pointer select-none"
  onClick={() => setTypeFilter(null)}
>
```

**WCAG:** 4.1.2 Name, Role, Value (Level A); 2.1.1 Keyboard (Level A)
**Impact:** Keyboard-only users cannot filter anti-cheat events by type. The filters are completely inaccessible without a mouse.
**Fix:** Replace with `<Button variant="outline" size="sm">` or add `role="button"`, `tabIndex={0}`, `onKeyDown` to the Badge.

---

### D-29: Chat widget panel lacks dialog semantics and focus trap

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:262–362`
**Severity:** High
**Confidence:** High

The chat widget's open state renders a full panel as a plain `<div>` with `fixed` positioning. It lacks:
- `role="dialog"`, `aria-modal="true"`
- Focus trap (Tab key escapes the panel)
- `aria-label` or `aria-labelledby`
- No Escape key to close

**WCAG:** 4.1.2 Name, Role, Value (Level A); 2.4.3 Focus Order (Level A)
**Impact:** Screen reader users have no context that this is a modal. Keyboard users can Tab out of the chat panel into the hidden page content.
**Fix:** Wrap in Dialog or add `role="dialog"`, `aria-modal`, focus trap, and Escape key handling.

---

### D-30: Chat widget inner buttons lack focus-visible ring

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:268–284`
**Severity:** Medium
**Confidence:** High

The minimize and close buttons inside the chat header have only `hover:` styling — no `focus-visible:` ring. Keyboard users cannot see when these buttons have focus.

```tsx
<button
  onClick={() => setIsMinimized(true)}
  className="rounded p-1 hover:bg-primary-foreground/20"
  aria-label={t("minimize")}
>
```

**WCAG:** 2.4.7 Focus Visible (Level AA)
**Impact:** Keyboard-only users cannot determine which button is focused.
**Fix:** Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` to the button class.

---

### D-31: Language selector clear button lacks focus ring

**File:** `src/components/language-selector.tsx:195–202`
**Severity:** Low
**Confidence:** High

The clear search button uses only `hover:` styling with no `focus-visible:` ring.

```tsx
<button
  type="button"
  onClick={() => setInputValue("")}
  className="ml-1 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
  aria-label="Clear search"
>
```

**WCAG:** 2.4.7 Focus Visible (Level AA)
**Impact:** Keyboard users cannot see focus on the clear button.
**Fix:** Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`.

---

### D-32: Form Labels without `htmlFor` — 25+ inputs across admin forms

**Files (high-impact — direct text inputs):**
- `src/lib/plugins/chat-widget/admin-config.tsx:170,256,291,302`
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:340`
- `src/app/(dashboard)/dashboard/admin/settings/footer-content-form.tsx:127,138–149`
- `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:482–626`
- `src/components/contest/recruiting-invitations-panel.tsx:397,405`

**Severity:** Medium
**Confidence:** High

Multiple `<Label>` components do not have `htmlFor` attributes matching their associated `<Input>` elements. Without `htmlFor`, clicking the label does not focus the input, and screen readers cannot programmatically associate the label with the control.

**WCAG:** 1.3.1 Info and Relationships (Level A); 3.3.2 Labels or Instructions (Level A)
**Impact:** Screen reader users cannot determine which label applies to which input. Clicking a label does not focus the corresponding field, reducing usability for motor-impaired users.
**Fix:** Add `htmlFor` to each `<Label>` matching the `id` on the corresponding `<Input>`.

---

### D-33: Chat widget textarea has no label — placeholder is not a substitute

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:332–346`
**Severity:** Medium
**Confidence:** High

The chat input textarea has a `placeholder` but no `<label>` or `aria-label`. Per WCAG, placeholders are not substitutes for accessible labels.

```tsx
<textarea
  placeholder={t("placeholder")}
  className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
/>
```

**WCAG:** 1.3.1 Info and Relationships (Level A); 3.3.2 Labels or Instructions (Level A)
**Impact:** Screen reader users cannot determine the purpose of the input field.
**Fix:** Add `aria-label={t("placeholder")}` or a visually hidden `<label>`.

---

### D-34: Workers admin icon-only buttons missing `aria-label`

**File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:120,123,137,189,203,372`
**Severity:** Medium
**Confidence:** High

6 icon-only buttons (save, cancel edit, edit, copy docker command, copy deploy command, remove worker) have no `aria-label`.

**WCAG:** 4.1.2 Name, Role, Value (Level A)
**Impact:** Screen reader users cannot determine the purpose of these action buttons.
**Fix:** Add `aria-label` to each icon-only button.

---

### D-35: Language config table icon-only buttons missing `aria-label`

**File:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:437,442,454`
**Severity:** Medium
**Confidence:** High

3 icon-only buttons (edit language, build image, remove image) have only `title` attributes, not `aria-label`.

**WCAG:** 4.1.2 Name, Role, Value (Level A)
**Impact:** Screen reader users cannot determine the purpose of these action buttons.
**Fix:** Add `aria-label` to each icon-only button.

---

### D-36: Contest replay JavaScript animations bypass CSS reduced-motion

**File:** `src/components/contest/contest-replay.tsx:119–126`
**Severity:** Low
**Confidence:** Medium

The contest replay uses JavaScript-driven inline styles for row-flip animations:

```tsx
row.style.transition = "none";
row.style.transform = `translateY(${deltaY}px)`;
row.getBoundingClientRect();
requestAnimationFrame(() => {
  row.style.transition = "transform 450ms ease";
  row.style.transform = "";
});
```

These inline styles are NOT governed by the CSS `prefers-reduced-motion` rule in `globals.css`. When a user has reduced motion enabled, these animations will still play at full speed.

**WCAG:** 2.3.3 Animation from Interactions (Level AAA)
**Impact:** Users with vestibular disorders may experience discomfort from the row-flip animations even with reduced-motion preferences set.
**Fix:** Check `window.matchMedia('(prefers-reduced-motion: reduce)')` before applying the transition, or use `transition: none` when the preference is set.

---

### D-37: Contest announcements/clarifications delete actions lack confirmation dialogs

**File:** `src/components/contest/contest-announcements.tsx:225`
**File:** `src/components/contest/contest-clarifications.tsx:247`
**Severity:** High
**Confidence:** High

Both the announcement delete and clarification delete actions call their respective handlers directly without any confirmation dialog. These are destructive actions that permanently remove content visible to contest participants.

**Impact:** An accidental click permanently deletes an announcement or clarification that may have already been seen by participants, causing confusion.
**Fix:** Wrap delete triggers in `DestructiveActionDialog` or `AlertDialog`, consistent with the post deletion pattern.

---

### D-38: Group instructors manager "Remove" action lacks confirmation

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-instructors-manager.tsx:193`
**Severity:** Medium
**Confidence:** High

The remove instructor action fires directly without confirmation. While not as destructive as data deletion, removing an instructor from a course can disrupt their workflow and requires manual re-invitation to undo.

**Impact:** Accidental removal of an instructor from a group/section, requiring manual re-addition.
**Fix:** Add a confirmation dialog before removing an instructor.

---

### D-39: Multiple components use text-only loading states instead of Skeleton

**File:** `src/components/contest/recruiting-invitations-panel.tsx:497`
**File:** `src/components/contest/contest-announcements.tsx`
**File:** `src/components/contest/contest-clarifications.tsx`
**File:** `src/components/contest/anti-cheat-dashboard.tsx`
**File:** `src/components/contest/participant-anti-cheat-timeline.tsx`
**File:** `src/components/problem/accepted-solutions.tsx`
**File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx`
**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx`
**Severity:** Low
**Confidence:** High

These components render plain `<p>Loading...</p>` or equivalent text while loading, instead of using the `Skeleton` component. The leaderboard table (`leaderboard-table.tsx:109–162`) demonstrates the correct pattern with a full skeleton table that preserves layout shape.

**Impact:** Jarring layout shift when data arrives; text-only loading doesn't communicate the expected content layout, making the page feel slower.
**Fix:** Replace text-only loading with `Skeleton` components matching the expected content layout.

---

### D-40: Chat logs client has hardcoded English strings

**File:** `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:111,148,158`
**Severity:** Medium
**Confidence:** High

Multiple UI strings in the chat logs client are hardcoded in English instead of using i18n keys. This breaks the localization experience for Korean and other language users.

**Impact:** Non-English admins see a mix of localized and English text in the chat logs interface.
**Fix:** Replace hardcoded strings with `useTranslations()` calls.

---

### D-41: Public contest detail has hardcoded "Overview" string

**File:** `src/app/(public)/_components/public-contest-detail.tsx:130`
**Severity:** Low
**Confidence:** Medium

A hardcoded "Overview" string is used in the public contest detail component instead of an i18n key.

**Impact:** The tab label always appears in English regardless of the selected locale.
**Fix:** Replace with `t("overview")` i18n key.

---

### D-42: Languages page uses fixed min-width without responsive scroll wrapper

**File:** `src/app/(public)/languages/page.tsx:152`
**Severity:** Low
**Confidence:** High

The languages page uses `min-w-[800px]` without an `overflow-x-auto` wrapper, causing horizontal overflow on mobile screens without a scroll indicator.

**Impact:** On mobile devices, the language configuration table overflows the viewport with no way to scroll or indication that content is clipped.
**Fix:** Wrap in `overflow-x-auto` container, same as the leaderboard table pattern.

---

### D-43: User stats dashboard uses fixed `grid-cols-3` without mobile breakpoint

**File:** `src/app/(public)/users/[id]/page.tsx:225`
**Severity:** Low
**Confidence:** Medium

The user profile page stats section uses `grid-cols-3` with no responsive breakpoint, making the three-column layout cramped on narrow screens.

**Impact:** Stats cards are too narrow on mobile, with text potentially truncating or wrapping awkwardly.
**Fix:** Use `grid-cols-1 sm:grid-cols-3` to stack on mobile and expand on wider screens.

---

## Summary

| Severity | Count |
|---|---|
| High | 9 (D-01, D-02, D-04, D-11/D-25, D-12, D-28, D-29, D-37) |
| Medium | 13 (D-03, D-05, D-06, D-07, D-08, D-10, D-13, D-23, D-30, D-32, D-33, D-34, D-35, D-38, D-40) |
| Low | 21 (D-09, D-14, D-15, D-16, D-17, D-18, D-19, D-20, D-21, D-22, D-24, D-26, D-27, D-31, D-36, D-39, D-41, D-42, D-43) |

### Top Priority Fixes

1. **D-01/D-02/D-03/D-12/D-34/D-35** — Add `aria-label` to all icon-only buttons across recruiting invitations, lecture toolbar, code editor, workers admin, and language config table (~25 buttons, simple high-impact WCAG A fix)
2. **D-04/D-29** — Convert submission overview panel and chat widget to proper Dialog with focus trap (critical for keyboard users)
3. **D-11/D-25/D-37** — Add confirmation dialog to thread deletion, announcement deletion, and clarification deletion (destructive actions without guards)
4. **D-05** — Add dialog semantics to anti-cheat privacy notice overlay
5. **D-28** — Make Badge filter chips keyboard accessible (add `role="button"`, `tabIndex`, `onKeyDown`)
6. **D-06** — Replace hardcoded color classes with semantic tokens that guarantee contrast in both themes
7. **D-32** — Add `htmlFor` to 25+ `<Label>` elements across admin forms
