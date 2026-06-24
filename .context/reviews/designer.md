# Designer UI/UX Review - Review-Plan-Fix Cycle 2 Prompt 1

Repository: `/Users/hletrd/flash-shared/judgekit`
Date: 2026-06-23
Role: designer UI/UX specialist
Scope: current dirty repository. No fixes implemented.

Findings count: 8

## Method And Runtime Status

I first built a UI inventory from the current tree and then reviewed returned source evidence across routes, layout, primitives, styles, i18n, and tests. The shared `flash-shared` mount was intermittently stalled: broad `find`, `git status`, `rg --files`, and several targeted reads blocked in uninterruptible filesystem I/O before later returning. I did not revert or modify prior-cycle work.

Agent-browser coverage was attempted. The existing browser session on `localhost:3000` was an unrelated `ccusage` app, so I did not use it as JudgeKit evidence. `http://127.0.0.1:3111/` returned `ERR_CONNECTION_REFUSED`. A bounded attempt to start `npm run dev -- -H 127.0.0.1 -p 3111` hung before spawning Next and was killed. Live JudgeKit interaction is therefore blocked by local runtime/filesystem pressure for this pass; findings below use text-extractable source evidence.

## UI Inventory

Routes:

- App shell: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/not-found.tsx`, `src/app/globals.css`.
- Auth routes: `src/app/(auth)/login`, `signup`, `forgot-password`, `reset-password`, `verify-email`, `recruit`; standalone `src/app/change-password`.
- Dashboard routes: `src/app/(dashboard)/layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `dashboard/**`, including admin pages and language management.
- Public routes: `src/app/(public)/layout.tsx`, `loading.tsx`, `not-found.tsx`, `_components`, `community`, `contests`, `dashboard`, `groups`, `languages`, `playground`, `practice`, `privacy`, `problem-sets`, `problems`, `profile`, `rankings`, `submissions`, `users`.
- API routes were considered where they directly feed UI loading/error states, but this review focused on UI-bearing files.

Components and styles:

- Shell/layout: `src/components/layout/public-header.tsx`, footer/sidebar/theme/locale/skip navigation components.
- Primitives: `src/components/ui/*`, including `button`, `select`, `sheet`, `dialog`, `dropdown-menu`, `sidebar`, `skeleton`, `tabs`, `tooltip`, `table`.
- Workflow components: code editor/compiler surfaces, contest widgets, discussion forms/lists, exam anti-cheat widgets, problem authoring/rendering, public lists, language/filter/pagination controls, plugin chat loader, user stats.
- Styles and i18n: `src/app/globals.css`, `src/components/theme-provider.tsx`, `messages/en.json`, `messages/ko.json`, `static-site/**`.

Tests:

- E2E: auth, public shell/routes, responsive/mobile layout, practice/problem/problem-set flows, contests, admin languages/users/audit/logs/settings/workers, profile, rankings, function judging.
- Component: public header/footer/home/problem list/detail, locale/theme toggles, login/signup/verify/change password, compiler/code widgets, destructive dialog, language page, filters, pagination, contest/admin/problem authoring components.
- Unit: UI runtime/i18n hardcoded keys, a11y review fixes, keyboard trap escape, mobile/practice implementation tests, public route implementation tests.

## Findings

### D2-1 - Medium - Current navigation is visual-only and does not expose `aria-current`

Status: confirmed
Confidence: High

Evidence:

- Desktop public nav computes `active` and applies only classes at `src/components/layout/public-header.tsx:180-195`.
- Mobile nav repeats the same pattern at `src/components/layout/public-header.tsx:283-301`.
- No `aria-current="page"` is emitted on either active link.

User failure scenario: A screen-reader user on `/practice`, `/problems`, or `/dashboard` hears a list of navigation links but no programmatic indication of the current section. Sighted users get an accent background, but non-visual navigation users must infer state from URL or page heading.

Suggested fix: Add `aria-current={active ? "page" : undefined}` to desktop and mobile nav links. Do the same for dashboard dropdown/quick links where a current page can be represented.

### D2-2 - Medium - Navigation buttons still use invalid or inconsistent link/button composition

Status: confirmed
Confidence: High

Evidence:

- `src/app/(public)/dashboard/_components/admin-dashboard.tsx:53-58` wraps a `Button` in `Link`.
- `src/app/(public)/dashboard/_components/admin-dashboard.tsx:61-65` repeats `Link > Button` for shortcut links.
- `src/app/(public)/_components/public-home-page.tsx:79-83` uses `Button render={<Link ... />}` for hero navigation.
- `src/components/ui/button.tsx:47-58` is a Base UI button primitive with button styling and behavior by default.

User failure scenario: Keyboard and assistive-tech users encounter navigation rendered as button semantics in some places and links in others. The `Link > Button` cases create nested interactive controls, which can produce duplicate names, confusing roles, or inconsistent activation behavior.

Suggested fix: For navigation, render a `Link` with `buttonVariants(...)` classes or one well-tested anchor-rendering wrapper. Do not nest `<Button>` inside `<Link>`. Add a component test or lint guard for `Link > Button`.

### D2-3 - Medium - Practice filters expose unlabeled comboboxes

Status: confirmed
Confidence: High

Evidence:

- `FilterSelect` supports `id`, `aria-label`, and `aria-labelledby`, and passes them to `SelectTrigger` at `src/components/filter-select.tsx:12-19` and `src/components/filter-select.tsx:37`.
- Practice tag and sort labels are plain `<label>` elements with no `htmlFor`, and callers omit accessible-name props at `src/app/(public)/practice/page.tsx:619-631` and `src/app/(public)/practice/page.tsx:646-658`.
- Difficulty range receives `minLabel` and `maxLabel`, but only uses them as placeholders; both `SelectTrigger` elements lack names at `src/components/problem/difficulty-range-filter.tsx:68-70` and `src/components/problem/difficulty-range-filter.tsx:90-92`.

User failure scenario: A screen-reader user tabbing through practice filters hears values such as tag name, `0`, `10`, or sort value without knowing whether the control is tag, minimum difficulty, maximum difficulty, or sort order.

Suggested fix: Wire visible labels to the triggers using `id`/`htmlFor` or `aria-labelledby`. For the range controls, expose distinct names such as "Minimum difficulty" and "Maximum difficulty".

### D2-4 - Medium - Public problem discovery relies on a wide horizontal table on mobile

Status: likely
Confidence: Medium

Evidence:

- The only non-empty public problem list layout is a table inside `overflow-x-auto` at `src/app/(public)/_components/public-problem-list.tsx:115-118`.
- The header defines eight columns, several with fixed widths, at `src/app/(public)/_components/public-problem-list.tsx:121-129`.
- Difficulty, tags, progress, and created date are later columns at `src/app/(public)/_components/public-problem-list.tsx:178-209`.

User failure scenario: On a phone, a student sees number/title first while difficulty, tags, progress, success rate, and date can sit off-canvas behind a horizontal scroll gesture. Those hidden fields are the main decision signals for choosing an appropriate problem.

Suggested fix: Add a mobile-specific stacked list/card layout below the small breakpoint, or provide a visible horizontal-scroll affordance with a sticky title column. Keep the table for desktop scanning.

### D2-5 - Medium - Route skeletons are silent to assistive technology

Status: confirmed
Confidence: High

Evidence:

- Admin loading renders only visual skeleton divs at `src/app/(dashboard)/dashboard/admin/loading.tsx:3-13`.
- Public problems loading does the same at `src/app/(public)/problems/loading.tsx:3-13`.
- The shared skeleton primitive is a bare animated `div` with `data-slot="skeleton"` and `animate-pulse` at `src/components/ui/skeleton.tsx:3-9`.

User failure scenario: A screen-reader user who navigates to a slow or stuck route receives no status announcement that content is loading. If a route render fails and leaves skeletons visible, the accessible main region can feel empty rather than busy or failed.

Suggested fix: Wrap route loading UIs in localized `role="status"`/`aria-live="polite"` text, mark decorative skeletons `aria-hidden="true"`, and ensure route error boundaries replace stuck loading states with actionable retry/error UI.

### D2-6 - Medium - Add Language disables the primary action without explaining the missing requirement

Status: confirmed
Confidence: High

Evidence:

- Required fields are spread through the Add Language sheet at `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:637-721`.
- The create button is disabled until five fields are non-empty at `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:739-742`.
- Because the button is disabled, native `required` validation cannot fire and no disabled reason is exposed.

User failure scenario: An admin adding a language can reach a disabled primary button and not know whether the missing value is language key, display name, extension, Docker image, or run command. This is worse for keyboard and screen-reader users because the disabled control cannot explain itself on activation.

Suggested fix: Keep the button enabled and validate on submit, or show inline required-field errors after blur/submit plus a programmatic disabled-reason summary. Required/optional status should be text and ARIA-visible, not only `required` attributes blocked by a disabled submit.

### D2-7 - Low - Mobile menu tap target is smaller than the rest of the header controls

Status: confirmed
Confidence: High

Evidence:

- The mobile nav toggle uses `size-8`, making the target 32px square at `src/components/layout/public-header.tsx:255-260`.
- The shared button primitive has `icon` as `size-10`, `icon-lg` as `size-11`, and even `icon-xs` sets `min-h-11 min-w-11` at `src/components/ui/button.tsx:32-37`.

User failure scenario: The primary mobile navigation affordance is smaller than nearby controls and below common 44px mobile guidance. Users with motor impairments or one-handed use are more likely to miss the menu button.

Suggested fix: Use the same practical target size as other header icon controls, for example `size-10` or `size-11`, while keeping the icon itself visually balanced.

### D2-8 - Low - Global non-Korean letter spacing reduces readability and conflicts with local typography direction

Status: risk
Confidence: Medium

Evidence:

- Global CSS sets `--letter-spacing-body: -0.01em` and applies it to `html` at `src/app/globals.css:131-132`.
- Korean is reset to normal at `src/app/globals.css:135`, which aligns with `CLAUDE.md`, but English and any future non-Korean locale inherit the tightened body spacing.
- Additional non-Korean heading tightening appears in public surfaces such as `src/app/(public)/_components/public-home-page.tsx:66-78` and `src/app/(public)/_components/public-problem-list.tsx:106-107`.

User failure scenario: Dense tables, form labels, and small muted helper text become slightly harder to read for English users, especially at small sizes. The codebase already had to special-case Korean to preserve readability, which suggests global tightening is the wrong default.

Suggested fix: Use normal body letter spacing globally. If a Latin-only display treatment is needed, keep it opt-in for uppercase labels or hero headings, never as the base `html` text metric.

## Coverage Notes Against Required Areas

- Information architecture: reviewed public shell, dashboard shortcuts, practice/problem discovery, admin language workflows, route layout hierarchy.
- Affordances: findings cover navigation state, link/button composition, disabled primary action, mobile table affordance, and mobile menu target size.
- Keyboard/focus: reviewed current mobile focus-trap code in `PublicHeader`; no current issue found there. Link/button composition and disabled actions remain keyboard risks.
- WCAG 2.2: findings cover `aria-current`, unlabeled comboboxes, loading status exposure, target sizing, and reduced readability from spacing. Current `globals.css:138` includes a reduced-motion media block, so I did not flag skeleton animation as a reduced-motion failure.
- Responsive: public problem list remains the main responsive IA concern.
- Loading/empty/error: route skeletons are silent; public problem list has an empty state at `src/app/(public)/_components/public-problem-list.tsx:110-113`.
- Form validation UX: Add Language disabled action is the clearest current issue.
- Dark/light mode: theme tokens are defined in `src/app/globals.css:55-119` and `ThemeProvider` uses system mode in `src/app/layout.tsx:79-87`; no text-backed dark-mode defect found in returned files.
- i18n/RTL: English/Korean are present; `src/app/layout.tsx:89` sets `lang={locale}` but no `dir`. I did not mark this as a finding because current locales are LTR, but RTL should be explicitly validated before adding any RTL locale.
- Perceived performance: local runtime and trace capture were blocked. Static review found local font `display: "swap"` in `src/app/layout.tsx:15-19`; no source-backed LCP/CLS/INP finding was confirmed.

## Fixed Since Prior Designer Review

I did not carry forward the previous admin-language perpetual skeleton finding. The current dirty file now passes interpolation values for `{file}` and `{binary}` in the language sheet help text at `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:574`, `587`, `707`, and `721`.

## Final Missed-Issue Sweep

I performed final sweeps over returned evidence for active nav state, `Link > Button` and button-rendered links, unlabeled selects, loading skeletons, disabled submit affordances, mobile-only table layout, target sizes, global typography, reduced motion, dark/light tokens, route/test inventory, and prior-review carryover. The broad recursive `SelectTrigger` scan was stopped after it blocked in filesystem I/O; targeted select sources for the current confirmed finding were read and cited above.

Known gaps caused by local runtime/filesystem blockers: no live JudgeKit route interaction, no fresh accessibility snapshot from JudgeKit, no screenshot or computed-style inspection, no axe run, no full keyboard traversal, no production-build performance trace, and no exhaustive numeric contrast matrix.
