# UI/UX + Accessibility Review — JudgeKit Web Frontend

**Review date:** 2026-07-07
**Reviewer:** designer (static code review)
**Scope:** `src/components/**`, `src/app/**` (App Router pages/layouts), `src/app/globals.css`, Tailwind v4 theme tokens, `messages/en.json` + `messages/ko.json`, `src/i18n/request.ts`.
**Method:** Static, text-extractable analysis only — no dev server was started. Evidence was gathered by reading component markup, className usage, ARIA attributes, CSS cascade/specificity, next-intl message catalogs, and library source (`@base-ui/react`, `use-intl`) where behavior needed to be proven rather than assumed. Color-contrast claims were computed programmatically (OKLCH → linear sRGB → WCAG relative luminance → contrast ratio) rather than eyeballed.

**Continuity check:** A prior designer review exists at this same path dated 2026-07-03 ("Cycle 4", 15 findings, also registered in `.context/reviews/_aggregate.md` as C4-039, C4-040, C4-094–C4-099, C4-140–C4-142, all logged "Open"). `git log -1 -- src/app src/components` resolves to commit `27adb33c` (2026-07-03, a backend files-download/rate-limit change, not a UI change), and `git log --oneline --since=2026-07-03 -- 'src/app/*' 'src/components/*'` returns no UI-touching commits. **No frontend code has changed since the Cycle 4 review.** Every Cycle 4 finding is therefore still open; this review reconfirms each one against current line numbers (a few had already shifted or were more nuanced than originally described — noted below) and adds a new round of findings the previous cycle did not surface, including one CRITICAL issue in the Korean letter-spacing system and one previously unchecked WCAG 1.4.11 contrast failure.

---

## Summary

JudgeKit's frontend remains well-structured: Tailwind v4 CSS variables drive light/dark/lecture themes, i18n key parity between `en.json` and `ko.json` is perfect (2,981/2,981 keys, zero missing either direction), and most of the design system (`Button`, `Input`, dialogs, dropdown radio groups, the countdown timer, submission status badges) already reflects thoughtful accessibility work — icon + text differentiation for status, `aria-live` timer warnings that don't spam screen readers, safe default-focus ordering in destructive dialogs, and a disciplined `locale !== "ko"` gate on essentially every `tracking-*` Tailwind utility in the app.

Two new findings from this cycle deserve top billing:

1. **CRITICAL — the CSS mechanism that is supposed to reset Korean letter-spacing to normal does not work for problem-description headings.** Tailwind v4's cascade-layer order (`theme, base, components, utilities`) means the `@layer components` rule that sets `--letter-spacing-heading: -0.02em` on `.problem-description :is(h1,h2,h3,h4)` always wins over the `@layer base` rule that resets the same custom property to `normal` under `html:lang(ko)` — regardless of specificity. Every heading inside a rendered problem statement, AI chat response, or problem-editor preview gets `-0.02em` tracking even when the page is in Korean, which directly violates the repository's own CRITICAL typography rule.
2. **HIGH — the default focus ring fails WCAG 1.4.11 in light mode.** `--ring: oklch(0.708 0 0)` against `--background: oklch(1 0 0)` computes to **2.59:1**, below the 3:1 minimum for non-text/UI-component contrast. Because `focus-visible:border-ring focus-visible:ring-ring/50` is the shared focus-indicator pattern baked into `Button`, `Input`, `Textarea`, `Checkbox`, and `SelectTrigger`, this single token affects the visible focus indicator for nearly every interactive control in light mode. Dark mode's `--ring` (0.556) against dark `--background` (0.145) computes to 4.18:1 and is fine.

The three highest-priority carry-overs from Cycle 4 — empty `<SelectValue>` fallbacks, un-associated `<Label>`s, and `<Link>`-wrapping-`<Button>` — remain unfixed, confirmed by the zero-UI-commits fact above plus direct re-reads of the most-cited files.

---

## UI Inventory Reviewed

- **Global styles:** `src/app/globals.css` (theme tokens for `:root`, `.dark`, three lecture-mode themes, `problem-description` typography layer, reduced-motion query).
- **Design system:** `src/components/ui/*` (Button, Input, Textarea, Select, Combobox-based `LanguageSelector`, Dialog, AlertDialog, Sheet, DropdownMenu, Checkbox, Label, Badge, Tabs, Tooltip).
- **Layout:** public header/footer, dashboard breadcrumb shell, auth chrome, skip-to-content, theme/locale/lecture-mode toggles.
- **Feature surfaces re-verified in source:** problem create/edit + submission form, playground (`compiler-client.tsx`), contest management tabs, assignment form dialog, discussions (vote buttons, thread/post forms), exam countdown timer, chat widget, pagination controls, capability matrix, recruit invitation page.
- **i18n:** `messages/en.json`, `messages/ko.json` (full key-parity diff run programmatically), `src/i18n/request.ts` (locale resolution, no custom `getMessageFallback`/`onError`).

---

## New Findings (This Cycle)

### N1. Korean letter-spacing reset is defeated by Tailwind v4 cascade-layer order

- **Severity:** CRITICAL
- **Confidence:** High (verified via CSS cascade-layer semantics + Tailwind v4's `@layer theme, base, components, utilities` order, and confirmed `<html lang={locale}>` is set dynamically in `src/app/layout.tsx:100`)
- **Files:** `src/app/globals.css:134-137` (the reset) vs. `src/app/globals.css:218-227` (the override)
- **Problem:** `html:lang(ko)` (inside `@layer base`, opened at `globals.css:120`) sets `--letter-spacing-heading: normal`. But `.problem-description :is(h1, h2, h3, h4)` (inside a *separate, later-declared* `@layer components`, opened at `globals.css:163`) sets `--letter-spacing-heading: -0.02em` on itself and consumes it via `letter-spacing: var(--letter-spacing-heading)` in the same rule. Per the CSS Cascade Layers spec (and Tailwind v4's built-in layer order), rules in a later-declared layer **always** beat rules in an earlier layer for the same element, independent of selector specificity. `components` is declared after `base`, so the `-0.02em` heading override always wins on `<html lang="ko">` — the "use a CSS custom property so `html:lang(ko)` can override to normal" comment at `globals.css:129-130` does not achieve its stated goal for this selector. (It does work correctly for the *body* text case, because both the setter and the consumer for `--letter-spacing-body` live in the same `@layer base` rule.)
- **Blast radius:** the `.problem-description` class is used by `src/components/problem-description.tsx` (main problem statement renderer), `src/components/assistant-markdown.tsx` (AI chat responses), `src/components/problem/structured-problem-statement.tsx`, `src/app/(public)/problems/create/create-problem-form.tsx` (author preview pane), and `src/components/exam/anti-cheat-monitor.tsx`. Any Korean markdown heading rendered through any of these (e.g., a problem statement's "제약조건" or "예제" section header) gets `-0.02em` tracking regardless of locale.
- **Failure scenario:** A Korean-language problem statement with an `##` heading renders that heading with compressed tracking even though the project's own rule — and the surrounding component-level code, which is otherwise scrupulously disciplined about gating every `tracking-*` utility on `locale !== "ko"` — says it should not.
- **Fix:** Either (a) move the `.problem-description` heading rule into `@layer base` so it shares a layer with the `html:lang(ko)` reset, or (b) drop the indirection and write the rule directly as two selectors — `.problem-description :is(h1,h2,h3,h4) { letter-spacing: -0.02em; } html:lang(ko) .problem-description :is(h1,h2,h3,h4) { letter-spacing: normal; }` — inside the same layer, or (c) read the CSS custom property from `:root`/`html` rather than re-declaring it locally (drop the local `--letter-spacing-heading: -0.02em;` declaration inside `.problem-description :is(h1,h2,h3,h4)` entirely, and only set it once, in `@layer base`, next to `--letter-spacing-body`).
- **WCAG:** Not a WCAG success criterion, but explicitly a project-mandated CRITICAL rule per `CLAUDE.md`, and functionally a readability regression for Korean users per typographic best practice.

### N2. Default focus ring fails WCAG 1.4.11 non-text contrast in light mode

- **Severity:** HIGH
- **Confidence:** High (computed: OKLCH `(0.708, 0, 0)` vs. OKLCH `(1, 0, 0)` → linear sRGB → relative luminance → **2.59:1**, below the 3:1 minimum)
- **Files:** `src/app/globals.css:69` (`--ring: oklch(0.708 0 0)` under `:root`), consumed by the shared `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` pattern in `src/components/ui/button.tsx:9`, `src/components/ui/input.tsx:12`, `src/components/ui/textarea.tsx:10`, `src/components/ui/checkbox.tsx:20`, `src/components/ui/select.tsx:44`.
- **Problem:** WCAG 1.4.11 requires a 3:1 contrast ratio for the visual boundary that indicates UI-component state, including focus indicators. In light mode, both the ring glow (already reduced by the `/50` opacity modifier, so *effectively* lower than 2.59:1 against a white page) and the full-opacity `border-ring` state change fall short of that minimum against `--background`/`--card` (both `oklch(1 0 0)`/near-white). Dark mode's equivalent pair (`--ring: oklch(0.556 0 0)` vs. `--background: oklch(0.145 0 0)`) computes to 4.18:1 and passes comfortably — this is a light-mode-only regression.
- **Failure scenario:** A keyboard-only user tabbing through any form, the playground, or a dialog in light mode sees a very faint gray ring/border shift on focus that is difficult to distinguish from the unfocused state, especially for users with low vision.
- **Fix:** Darken `--ring` for the light theme (e.g., toward `oklch(0.55 0 0)` or lower, which the computation shows clears 3:1 against white), or switch the light-mode focus indicator to a more saturated/darker token (e.g., reuse `--primary`, which is `oklch(0.205 0 0)` and would give a very high-contrast ring).
- **WCAG:** 1.4.11 Non-text Contrast (AA).

### N3. Root cause of the playground's raw-key test-case name confirmed via `next-intl` source

- **Severity:** MEDIUM (upgraded confidence vs. Cycle 4's speculative version of this finding)
- **Confidence:** High — traced through `node_modules/use-intl/dist/esm/development/initializeConfig-CUsOI8u2.js`: `defaultGetMessageFallback(props) { return joinPath(props.namespace, props.key); }`, and `src/i18n/request.ts` configures no custom `onError`/`getMessageFallback`.
- **Files:** `src/components/code/compiler-client.tsx:91-93` (`buildDefaultTestCaseName`), `:128`, `:212`, `:479` (call sites), vs. `:463` (correct call site).
- **Problem:** `messages/en.json:467` defines `"testCaseLabel": "Test Case {number}"` (an ICU message requiring a `number` argument). `buildDefaultTestCaseName(index, label)` is called as `buildDefaultTestCaseName(1, t("testCaseLabel"))` — i.e., `t()` is invoked **without** the required `number` argument, expecting it to return the raw, unsubstituted template string `"Test Case {number}"` so that `.replace("{number}", String(index))` can manually fill it in. But `next-intl`'s formatter throws a `FORMATTING_ERROR` when a required ICU argument is missing, and — since this app configures no custom `getMessageFallback` — the default fallback is `joinPath(namespace, key)`, i.e., the literal string `"compiler.testCaseLabel"`. Because that string does not contain the substring `"{number}"`, `.replace()` is a no-op, and the default test-case name is the raw i18n key, not `"Test Case 1"`.
- **Failure scenario:** Every time a user opens the playground or adds a new test case (`:128`, `:212`) or clears the case-name field (`:479`), the tab and the visible name field show the literal text `compiler.testCaseLabel` instead of "Test Case 1" / "테스트 케이스 1" — confirmed reproducible from the code, not merely suspected.
- **Fix:** Stop passing a pre-formatted label into `buildDefaultTestCaseName`; call `t("testCaseLabel", { number: index })` directly at every call site (matching the already-correct pattern at `:463`), and delete the string-replace helper.
- **WCAG:** Not a WCAG criterion, but a functional i18n/content-quality defect that also has an a11y angle (screen readers read the raw dotted key aloud).

### N4. Lecture-mode toggle switch has no accessible name, role, or state — and may be keyboard-unreachable

- **Severity:** HIGH
- **Confidence:** High for the missing-ARIA part (direct code read); Medium for the keyboard-unreachability part (inferred from `@base-ui/react/menu`'s roving-focus model, not empirically confirmed in a browser)
- **File:** `src/components/layout/lecture-mode-toggle.tsx:70-84`
- **Problem:** The Lecture Mode on/off switch is a hand-built `<button type="button" onClick={...}>` styled as an iOS-style toggle (a track + animated thumb), rendered as a sibling of a `<span>{t("lectureMode")}</span>` inside `DropdownMenuLabel` (`:68-85`). It has **no** `aria-label`, `aria-labelledby`, `role="switch"`, or `aria-checked` — a screen reader announces it only as an unlabeled "button" with no indication of on/off state (the visual state is communicated purely by track color and thumb position). Additionally, `DropdownMenuLabel` renders `@base-ui/react/menu`'s `Menu.GroupLabel` (`src/components/ui/dropdown-menu.tsx:56-74`), which is a non-interactive labeling element, not a `Menu.Item` — Base UI's menu manages arrow-key navigation via a roving-tabindex model scoped to registered menu items, so a plain `<button>` nested inside a `GroupLabel` is very likely not reachable via `ArrowDown`/`ArrowUp` inside the open menu, and `Tab` conventionally closes menu widgets per the ARIA APG rather than tabbing into non-item content.
- **Failure scenario:** A keyboard-only or screen-reader user opens the lecture-mode dropdown and cannot discover that a toggle exists (no name), cannot tell if it's on (no state), and may not even be able to focus it without a mouse — for what is this feature's primary control.
- **Fix:** Add `role="switch"` and `aria-checked={active}` and an accessible name (`aria-label={t("lectureMode")}` or `aria-labelledby` pointing at the sibling `<span>`). Move the switch out of `DropdownMenuLabel` into a proper `DropdownMenuItem`/`Menu.CheckboxItem`-equivalent (or otherwise verify via a real browser/AT test that it is reachable by keyboard) so it participates in the menu's normal focus management.
- **WCAG:** 4.1.2 Name, Role, Value (A); 2.1.1 Keyboard (A) if the reachability concern is confirmed.

### N5. Streaming assistant chat responses render inside an implicit `aria-live` region

- **Severity:** MEDIUM
- **Confidence:** Medium (the pattern is a documented ARIA anti-pattern; exact assistive-technology behavior varies by browser/screen-reader combination and was not empirically tested)
- **File:** `src/lib/plugins/chat-widget/chat-widget.tsx:337` (`<div ... role="log" aria-label={t("name")} ...>`)
- **Problem:** `role="log"` carries an implicit `aria-live="polite"`. The assistant's message content (`msg.content`) is streamed token-by-token and re-rendered inside this live region via `<AssistantMarkdown content={msg.content} />` as it grows. Live regions are designed for discrete, infrequent updates (e.g., "message received"); a region whose text content mutates dozens of times per second during generation is a known anti-pattern that can cause screen readers to either queue and read every fragment (a firehose of noise) or become unresponsive/laggy during the update storm.
- **Failure scenario:** A screen-reader user opens the chat widget and asks a question; while the assistant's answer streams in, their screen reader either falls silent until generation finishes (best case) or reads out overlapping fragments continuously (worse case), making the streaming chat feature difficult to use non-visually.
- **Fix:** Suppress live-region announcements while `isStreaming` is true (e.g., `aria-live="off"` during streaming, switched to `"polite"` only once the message is complete), or move to a pattern where only the final, complete message is announced.
- **WCAG:** 4.1.3 Status Messages (AA) — not a strict violation of the letter of the rule, but works against its spirit for this dynamic-content case.

### N6. Discussion vote buttons don't expose pressed state

- **Severity:** LOW–MEDIUM
- **Confidence:** High
- **File:** `src/components/discussions/discussion-vote-buttons.tsx:82-106`
- **Problem:** The upvote/downvote buttons change `variant` (`"default"` vs `"ghost"`) to show the user's current vote, but neither button sets `aria-pressed`. The vote `score` (`:94`, a plain `<span>`) also has no `aria-live` region, so after a vote the updated count is not announced.
- **Failure scenario:** A screen-reader user can activate the upvote button but gets no confirmation of whether their vote registered or what direction is currently selected, and doesn't hear the score change.
- **Fix:** Add `aria-pressed={currentUserVote === "up"}` / `aria-pressed={currentUserVote === "down"}` to the respective buttons, and wrap the score `<span>` in a small `aria-live="polite"` region (or announce via an `sr-only` status message on successful vote).
- **WCAG:** 4.1.2 Name, Role, Value (A).

### N7. Capability matrix checkbox groups have no programmatic group label

- **Severity:** LOW
- **Confidence:** Medium
- **File:** `src/app/(dashboard)/dashboard/admin/roles/capability-matrix.tsx:56-102`
- **Problem:** Each capability group renders an `<h4>` visual heading (`:59`) followed by a grid of individually-labeled checkboxes (`id`/`htmlFor` pairing here is done correctly, `:86-97`). But the group itself is a plain `<div>`, not a `<fieldset>`/`<legend>` or `role="group" aria-labelledby`, so a screen-reader user tabbing checkbox-by-checkbox through a long capability list (the role editor can have dozens of capabilities across many groups) doesn't hear which group they're in.
- **Failure scenario:** In the role editor, a screen-reader user hears a long, undifferentiated sequence of capability names with no section context.
- **Fix:** Wrap each group in `<fieldset>` with a `<legend>` matching the `<h4>` text (visually restyled to match, if needed), or add `role="group" aria-labelledby={groupHeadingId}` to the group wrapper `<div>`.
- **WCAG:** 1.3.1 Info and Relationships (A).

### N8. Minor: dead/no-op `rtl:` utility

- **Severity:** Informational
- **Confidence:** High
- **File:** `src/components/ui/sidebar.tsx:281`
- **Problem:** `ltr:-translate-x-1/2 rtl:-translate-x-1/2` sets the *same* value for both directions, so the `rtl:` variant is a no-op (and the app has no RTL locale configured — `SUPPORTED_LOCALES` is `en`/`ko`, both LTR, and `<html>` never sets `dir`). Not a bug today, just dead code that could mislead a future contributor into thinking RTL is supported.
- **Fix:** Remove the redundant `rtl:` variant, or leave a comment noting RTL is not yet supported.

---

## Confirmed Status of Cycle 4 (2026-07-03) Findings

All 15 Cycle 4 findings were re-checked. Because zero UI-touching commits have landed since that review (see Continuity Check above), the expectation was "still open," which held for all but one (pagination), where the code turned out to already be better than the prior review described.

### C1. Empty `<SelectValue />` shows raw option values — **STILL OPEN**

- **Severity:** HIGH · **Confidence:** High
- **Files:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/filter-form.tsx:81`; `src/components/problem/accepted-solutions.tsx:121,136`; `src/components/contest/score-timeline-chart.tsx:66`; `src/components/contest/contest-replay.tsx:222`; `src/components/contest/contest-clarifications.tsx:203`; `src/components/contest/anti-cheat-dashboard.tsx:504`.
- Re-verified the underlying mechanism directly: `src/components/ui/select.tsx:21-29`'s `SelectValue` is a thin wrapper over `@base-ui/react/select`'s `Select.Value`, which renders the raw `value` string when given no children/placeholder — exactly the failure mode described in Cycle 4. No commits touched any of the six flagged files since 2026-07-03.
- **Fix (unchanged):** `<SelectValue>{labelMap[stateVar] ?? stateVar}</SelectValue>` in every trigger, per the pattern already used correctly elsewhere (e.g., `assignment-form-dialog.tsx:446`, `:484`, `:504`, `:641`).

### C2. Form `<Label>` not associated with its control — **STILL OPEN** (one sub-case downgraded)

- **Severity:** HIGH · **Confidence:** High
- Re-verified `src/app/(public)/groups/[id]/assignment-form-dialog.tsx` directly: lines **429, 461, 477, 497, 517, 632** are unchanged from Cycle 4 — each is a bare `<Label>{t(...)}</Label>` immediately preceding a `<Select>` (not a native input), with no `htmlFor`/`id` pairing and no `aria-labelledby` on the `SelectTrigger`.
- Also reconfirmed in `src/components/contest/quick-create-contest-form.tsx:106,115,126,140,151` — same pattern, still unassociated.
- **Correction to Cycle 4's characterization:** `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:386` (`<Label>{t("communityVotingTitle")}</Label>`) and `:408` (`<Label className="text-base font-medium">{t("smtpTitle")}</Label>`) are not actually broken *field* associations — both are **section headings** for a group of independently-labeled checkboxes/inputs underneath (each of which already has correct wrapping-label or `htmlFor` association). Using the `<Label>` component for a section heading is a minor semantic mismatch (a bare `<label>` with no `for` and no wrapped control does nothing harmful, but isn't the ideal element), not the same class of bug as the Select-trigger cases above. Recommend downgrading this specific sub-instance to LOW and swapping the heading to a plain `<p>`/`<h4>` with matching styling, or to `role="group" aria-labelledby`.
- **Fix (for the real cases):** Add `id` to the `SelectTrigger` (or the element `Select` ultimately renders) and `htmlFor` on the `Label`, or `aria-labelledby` on the trigger referencing the label's `id`.

### C3. `<Link>` wrapping `<Button>` — **STILL OPEN** (git-log inferred, not re-walked line-by-line this cycle)

- **Severity:** MEDIUM · **Confidence:** High
- **Files:** `src/app/(public)/practice/page.tsx`; `src/app/(public)/practice/problems/[id]/page.tsx:548-590`; `src/app/(public)/dashboard/_components/dashboard-judge-system-tabs.tsx:99-100`.
- No commits touched these files since Cycle 4's browser-verified findings; treated as unchanged.
- **Fix (unchanged):** Use `<Button asChild>` wrapping a single `<Link>`, or drop the inner `<Button>` and style the `<Link>` directly.

### C4. Tablists lack accessible names — **STILL OPEN**, confirmed with current lines

- **Severity:** MEDIUM · **Confidence:** High
- Re-verified directly: `src/components/code/compiler-client.tsx:452` (`<Tabs value={activeTestCase.id} onValueChange={setActiveTestCaseId} ...>`) has no `aria-label`. `src/app/(public)/contests/manage/[assignmentId]/page.tsx:396` (`<HashTabs defaultValue="overview">`) also has no `aria-label` on the tab root.
- Also still applies to `src/app/(public)/practice/problems/[id]/page.tsx` (problem/editorial/solutions/discussion tabs) and `src/app/(public)/problems/create/create-problem-form.tsx` (write/preview tabs); not re-walked line-by-line, git-log inferred unchanged.
- **Fix (unchanged):** `aria-label`/`aria-labelledby` on every `<Tabs>` root.

### C5. Playground language selector unlabeled — **STILL OPEN**, confirmed with current lines

- **Severity:** MEDIUM · **Confidence:** High
- Re-verified `src/components/code/compiler-client.tsx:380-385`: `<LanguageSelector languages={languages} value={language} onValueChange={handleLanguageChange} placeholder={t("language")} />` is called with no `id` prop and is not wrapped in a `<Label>`. `LanguageSelector` (`src/components/language-selector.tsx:53-63,156-157`) does accept an `id` for exactly this purpose and forwards it to the Combobox trigger — the plumbing exists but isn't used at this call site.
- **Fix (unchanged):** Pass an `id` and wrap with `<Label htmlFor={id}>{t("language")}</Label>`, or add `aria-label={t("language")}` directly to `LanguageSelector`'s trigger as a fallback default.
- **Note:** the "test-case tab shows raw i18n key" half of this Cycle 4 finding is superseded by the more precise root-cause analysis in **N3** above.

### C6. Missing visible focus indicators on custom interactive elements — **STILL OPEN**

- **Severity:** MEDIUM · **Confidence:** High
- **Files:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx`; `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx`; `src/components/contest/code-timeline-panel.tsx`; `src/components/problem/problem-submission-form.tsx`; `src/lib/plugins/chat-widget/chat-widget.tsx:316-331` (minimize/close header buttons still only have `hover:bg-primary-foreground/20`, confirmed directly, no focus ring); `src/components/layout/public-header.tsx`; `src/components/layout/public-footer.tsx`.
- **Fix (unchanged):** Apply `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (and see **N2** — first fix the `--ring` contrast so this fix is actually effective in light mode).

### C7. Status-board row nests interactive content inside `role="button"` — **STILL OPEN**

- **Severity:** MEDIUM · **Confidence:** High
- **File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:135-170`. `grep -rn 'role="button"' src` confirms exactly two remaining hand-rolled `role="button"` elements repo-wide: this file and `file-upload-dialog.tsx` — both already flagged (this finding and C6).
- **Fix (unchanged):** Make only the toggle affordance a real `<button type="button">`; keep the student link and "view submissions" button as sibling, non-nested focusable elements.

### C8. Chat widget: no focus trap; one hardcoded English label — **STILL OPEN**, narrowed with direct evidence

- **Severity:** MEDIUM · **Confidence:** High
- **File:** `src/lib/plugins/chat-widget/chat-widget.tsx`.
- Re-verified directly: the launcher button's `aria-label="Chat"` at **line 289** is the *only* hardcoded English string in this file — the minimize (`:319`), close (`:328`), send (`:401`), and minimized-state (`:298`) buttons all correctly use `t("minimize")`/`t("close")`/`t("send")`/`t("name")`. None of the four plain `<button>` elements in this file (`:285`, `:297`, `:319`, `:328`) has `type="button"` (only the send button at `:401` does) — low risk today since the widget isn't inside a `<form>`, but worth normalizing. No focus trap wraps the open panel (`:311` onward is a plain `<div>`, not a dialog-role container).
- **Fix (unchanged):** Localize line 289's `aria-label`; add `type="button"` to the four bare buttons; wrap the open panel in a focus trap or reuse the `Dialog` primitive.

### C9. Snapshot mini-timeline dots too small / no focus ring — **STILL OPEN** (git-log inferred)

- **Severity:** MEDIUM · **Confidence:** High
- **File:** `src/components/contest/code-timeline-panel.tsx:211-221`. Not re-walked line-by-line this cycle; unchanged per git log.
- **Fix (unchanged):** Enlarge to ≥24×24 CSS px hit area; add `focus-visible:ring-2`.

### C10. Some `<Button>` in forms lack explicit `type="button"` — **STILL OPEN**

- **Severity:** LOW · **Confidence:** High
- Re-verified `src/components/ui/button.tsx:47-60`: `Button` wraps `@base-ui/react/button`'s `Button` primitive and does not default `type` to `"button"` — the browser default (`"submit"`) applies whenever a consumer omits it inside a `<form>`.
- **Files:** `src/app/(public)/groups/[id]/group-instructors-manager.tsx:160`; `group-members-manager.tsx:399`; `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:100,115,230`; `language-config-table.tsx`; `api-keys-client.tsx`; `src/components/contest/access-code-manager.tsx`; `recruiting-invitations-panel.tsx`.
- **Fix (unchanged):** Add `type="button"` at each call site, or set a default in `buttonVariants`/the `Button` wrapper itself for safety.

### C11. Auth layout lacks header/nav landmark — **STILL OPEN**

- **Severity:** LOW · **Confidence:** High
- Re-verified `src/app/(auth)/layout.tsx:21-36` directly: the site-title link (`:24-28`) and theme/locale toggles (`:29-32`) are both bare `<div>`s; only `<main id="main-content">` (`:33`) is a landmark. Unlike the public layout, there is no `<header>`/`<nav>`.
- **Fix (unchanged):** Wrap the auth chrome in `<header>` (and `<nav aria-label>` if appropriate).

### C12. Problem detail page skips a heading level — **STILL OPEN** (git-log inferred)

- **Severity:** LOW · **Confidence:** Medium
- **File:** `src/app/(public)/practice/problems/[id]/page.tsx:521-560` — `<h1>` title followed by `<h3>` section headings with no `<h2>`.
- **Fix (unchanged):** Promote section headings to `<h2>`, or add a wrapping `<h2>` ("Statement").

### C13. Copy-code buttons share an identical accessible name — **STILL OPEN**, confirmed with direct evidence

- **Severity:** LOW · **Confidence:** High
- Re-verified `src/components/code/copy-code-button.tsx:37`: `aria-label={copied ? t("copied") : t("copyCode")}` is the same string for every instance. Confirmed at all four render sites: `src/components/problem-description.tsx:100`, `src/components/assistant-markdown.tsx:54`, and both branches of `src/components/code/code-viewer.tsx:29,49`. None passes a distinguishing index/label prop.
- **Fix (unchanged):** Thread an optional `label`/`index` prop through `CopyCodeButton` and use it to build a distinguishing `aria-label`, e.g. `t("copyExampleInput", { number })`.

### C14. Page-size links — **IMPROVED, downgraded from prior severity**

- **Severity:** LOW (previously MEDIUM-ish framing) · **Confidence:** High
- Re-verified `src/components/pagination-controls.tsx:66-83,71-79`: contrary to Cycle 4's description ("announced only as bare numbers"), each page-size `<Link>` **already** carries `aria-label={t("paginationPageSizeOption", { size })}` → `messages/en.json:85` = `"Show {size} items per page"` (and the Korean equivalent). The page-nav `<nav role="navigation" aria-label={t("paginationNav")}>` (`:86`) is also correctly labeled. The only remaining gap is that the page-size widget's own visible label (`t("paginationPageSize")` = "Page size", `:68`) isn't programmatically tied to the group of links via `<fieldset>/<legend>` or `role="group" aria-labelledby`.
- **Fix:** Wrap the page-size control in `<div role="group" aria-labelledby={pageSizeLabelId}>` (or a `<fieldset>`), matching the already-good per-link labeling.

### C15. Recruit page organization logo — **STILL OPEN**

- **Severity:** LOW · **Confidence:** High
- Re-verified `src/app/(auth)/recruit/[token]/page.tsx:240`: `alt={assignment.organizationName ?? ""}` unchanged.
- **Fix (unchanged):** `alt={assignment.organizationName ?? t("organizationLogo")}`.

---

## Positive Findings

- **i18n completeness is excellent.** Programmatic diff of `messages/en.json` and `messages/ko.json`: 2,981 keys each side, 0 missing in either direction. The 66 keys with identical en/ko values are all legitimately locale-neutral (brand name, placeholder emails, status abbreviations like "AC"/"WA"/"TLE" that are used as-is in Korean competitive-programming communities, `{value}`-only templates, compiler/Dockerfile technical strings) — no evidence of untranslated placeholder content.
- **Korean tracking-* discipline is otherwise exemplary.** A repo-wide `grep -rn "tracking-"` shows every single Latin-heading/uppercase-label utility gated behind `locale !== "ko"` (or explicitly commented as safe for Korean when applied to numerals/alphanumeric codes, e.g. access codes in `font-mono`). N1 above is a structural CSS-layer gap the component-level discipline can't catch, not a lapse in that discipline.
- **`muted-foreground` contrast is solid**, computed at 6.0–6.5:1 (light) and 6.8–8.9:1 (dark) against the backgrounds it's typically used on — comfortably above the 4.5:1 AA minimum, a spot many shadcn-based apps get wrong.
- **Embedded code-block syntax-highlighting colors** (`--problem-code-*`) all compute to 7.5–15.4:1 against their background in both light and dark variants — no contrast concerns there.
- **`SubmissionStatusBadge` never relies on color alone** — every status pairs a distinct icon (check/clock/alert-triangle) with a text label, plus a tooltip with the full verdict name (WCAG 1.4.1).
- **`CountdownTimer` is a model implementation**: `role="timer"`, a `role="alert"` on expiry, and a dedicated `sr-only` `aria-live` region that only announces at meaningful 15/5/1-minute thresholds (escalating to `assertive` at the 1-minute mark) rather than on every tick — avoids both silence and spam.
- **`ThemeToggle`/`LectureModeToggle` triggers** use proper `DropdownMenuRadioGroup`/`RadioItem` semantics (native checked/unchecked announcement), sized to the 44×44 CSS-px touch-target guideline on mobile with an explanatory code comment, and show an `aria-busy` skeleton before hydration.
- **`DestructiveActionDialog`** places Cancel before the destructive action in DOM order, so Base UI's default open-focus (first focusable element) lands on the safe choice, not the destructive one.
- **Dialog/AlertDialog/Sheet wrappers** (`src/components/ui/dialog.tsx` et al.) contain no custom `onOpenAutoFocus`/manual `.focus()` overrides that could fight Base UI's built-in focus-trap/restoration behavior.
- **Reduced motion** is handled globally (`@media (prefers-reduced-motion: reduce)` in `globals.css:138-145`) and `motion-safe:` is used for the chat-widget typing indicator.

---

## Final Sweep — Recommended Priority Order

1. **N1** (Korean letter-spacing cascade-layer bug) — CRITICAL, violates an explicit project rule, small/contained CSS fix.
2. **C1** (empty `SelectValue`) and **C2** (unassociated Select labels) — HIGH, still the most-cited, broadest-reach items from Cycle 4.
3. **N2** (light-mode focus-ring contrast) — HIGH, systemic (one token, every interactive control), quantified fix target already computed.
4. **N4** (lecture-mode switch a11y) — HIGH for a primary feature control.
5. **N3** (playground test-case raw-key name) — MEDIUM but trivial, now root-caused precisely; a two-line fix.
6. Remaining C3–C13/N5–N7 — MEDIUM/LOW, unchanged from Cycle 4 or newly logged this cycle.
7. **C14** — no action needed beyond the small `role="group"` wrapper; this one moved in the right direction on its own.

No commits have landed against `src/app`/`src/components` since the 2026-07-03 review, so the practical next step is the same as last cycle: schedule the Cycle 4 HIGH items (C1/C2) alongside the two new HIGH items (N2/N4) in the next remediation pass.
