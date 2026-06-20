# Designer / UI-UX Review - cycle 2 (2026-06-20)

Scope: UI/UX review only. I did not implement fixes. Edits are limited to this review file.

## Inventory Reviewed

- App shells and navigation: `src/app/layout.tsx`, `src/app/(public)/layout.tsx`, `src/app/(auth)/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/components/layout/public-header.tsx`, `src/components/layout/skip-to-content.tsx`, `src/lib/navigation/public-nav.ts`, `src/lib/navigation/admin-nav.ts`.
- Shared UI primitives: `src/components/ui/button.tsx`, `src/components/ui/select.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/sheet.tsx`, `src/components/ui/alert-dialog.tsx`, `src/components/ui/table.tsx`, `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/checkbox.tsx`, `src/components/filter-select.tsx`, `src/components/language-selector.tsx`.
- Public/student workflows: home, practice catalog/detail, problem catalog/detail/create/edit, submissions, rankings, contests, groups, playground, profile, auth forms.
- Admin/instructor workflows: dashboard, admin languages, admin submissions, admin users, API keys, files, workers, settings, contest management, recruiting invitations, participant timeline, code timeline.
- Core code-writing and problem-authoring surfaces: `src/components/code/*`, `src/components/problem/*`, `src/components/contest/*`, `src/components/assignment/*`.
- Localization/theme assets: `messages/en.json`, `messages/ko.json`, `src/app/globals.css`.
- Current uncommitted UI changes were included; I did not revert or modify them.

## Browser Coverage

- `bash scripts/playwright-local-webserver.sh` seeded a disposable local Postgres database but failed at `next build` with `ENOTEMPTY: directory not empty, rmdir '.next/standalone/node_modules/@img/sharp-darwin-arm64/lib'`. I switched to `next dev` against the existing local `judgekit-rpf-db` database on port 55433.
- Live app used for review: `http://127.0.0.1:3111`, launched with `DATABASE_URL=postgres://judgekit:judgekit_test@127.0.0.1:55433/judgekit`.
- Browser paths exercised with `agent-browser`: public home, login, authenticated dashboard, admin language management, add/edit language sheets, problem creation, practice catalog, mobile public nav, mobile admin language table, and dark-mode practice catalog.
- Evidence came from accessibility snapshots, console/errors, DOM queries, bounding boxes, computed styles, and responsive viewport checks. Screenshots were not needed for findings.

## Findings

### DSG2-1 - Button/link composition still creates invalid interactive semantics

- Severity: High
- Confidence: High
- Status: Confirmed
- Evidence: `src/components/ui/button.tsx:47-58` forwards Base UI `ButtonPrimitive` props without adapting `nativeButton` when rendering non-button elements. On the home page, `src/app/(public)/_components/public-home-page.tsx:80-82` renders `<Button render={<Link ... />}>`; the browser console reports: "Base UI: A component that acts as a button expected a native `<button>`..." The authenticated dashboard also has literal nested interactive controls: `src/app/(public)/dashboard/_components/admin-dashboard.tsx:53-58` and `src/app/(public)/dashboard/_components/admin-dashboard.tsx:63-65`; the accessibility snapshot exposed `link "Administration"` containing `button "Administration"`. Broad search still finds many `Link > Button` call sites across public/admin filters, tables, empty states, and navigation actions.
- Failure scenario: keyboard and screen-reader users encounter nested or mismatched link/button semantics. Focus, activation behavior, link rotor output, and form semantics become inconsistent on common navigation and filter controls.
- Suggested fix: standardize one composition pattern. Either render styled links directly with `buttonVariants`, or make `Button`/call sites set Base UI `nativeButton={false}` whenever `render` is an anchor. Replace `Link > Button` with a single interactive element and add a lint/test guard for this pattern.

### DSG2-2 - Several filter/select controls still lack programmatic labels

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Evidence: The problem-create comparison select has a visible heading but no accessible name: `src/app/(public)/problems/create/create-problem-form.tsx:802-813`; the live accessibility snapshot showed `combobox [expanded=false]: Exact Match` immediately after heading "Output Comparison". Practice catalog filters repeat this: visible labels at `src/app/(public)/practice/page.tsx:620-649` are not connected to the `FilterSelect`/`DifficultyRangeFilter` controls at `src/app/(public)/practice/page.tsx:623-658`; the live snapshot showed unlabeled comboboxes for "All tags", min difficulty "0", max difficulty "10", and "Number". `src/components/problem/difficulty-range-filter.tsx:68-90` renders two `SelectTrigger`s with no `id`, `aria-label`, or `aria-labelledby`. Similar unlabeled `SelectTrigger` instances exist in recruiting invitations (`src/components/contest/recruiting-invitations-panel.tsx:430-477`) and code timeline filtering (`src/components/contest/code-timeline-panel.tsx:168-171`).
- Failure scenario: screen-reader users hear only the current value, such as "Exact Match", "0", or "Number", without knowing whether the control changes comparison mode, min difficulty, max difficulty, sort order, invitation status, or problem filter.
- Suggested fix: require `SelectTrigger` wrappers to accept/pass `id`, `aria-label`, or `aria-labelledby`; connect every visible label via `htmlFor`/`id` or explicit ARIA. For paired range controls, use names like "Minimum difficulty" and "Maximum difficulty".

### DSG2-3 - Admin language command help triggers formatting errors and renders raw keys

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Evidence: In the edit language sheet, the live accessibility snapshot and DOM text showed literal `admin.languages.edit.compileCommandHelp` and `admin.languages.edit.runCommandHelp`; server/browser logs also emitted `FORMATTING_ERROR` for the same strings. Source calls `t("edit.compileCommandHelp")` and `t("edit.runCommandHelp")` without ICU values at `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:574` and `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:587`, repeated in the add sheet at `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:707` and `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:721`. The messages contain `{file}` and `{binary}` placeholders at `messages/en.json:1781-1783` and `messages/ko.json:1781-1783`, so next-intl logs errors and falls back to the key when values are omitted.
- Failure scenario: admins editing compile/run commands see opaque internal keys instead of the placeholder guidance needed to avoid breaking language execution, and the page continuously produces runtime i18n errors during the workflow.
- Suggested fix: pass escaped placeholder values, for example `{ file: "{file}", binary: "{binary}" }`, or rewrite the messages without ICU placeholders.

### DSG2-4 - Add Language hides required-field guidance behind a disabled primary action

- Severity: Medium
- Confidence: Medium
- Status: Likely
- Evidence: The add sheet marks required fields at `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:637-684` and `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:711-715`, but the Create button is disabled until all required fields are non-empty at `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:739-741`. The live add-sheet snapshot exposed `button "Create Language" [disabled]` with no status text describing which fields are missing; the language-key help paragraph at `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:645` is also not connected with `aria-describedby`.
- Failure scenario: keyboard and assistive-tech admins can tab through the form, arrive at a disabled Create button, and receive no actionable explanation. This is especially problematic because the form includes uncommon fields such as language key, Docker image, and run command.
- Suggested fix: keep the action enabled enough to submit and show inline validation, or expose an `aria-live`/described status listing missing required fields. Connect helper copy with `aria-describedby`.

### DSG2-5 - Dynamic authoring row actions do not include row context

- Severity: Medium
- Confidence: High
- Status: Confirmed from source
- Evidence: Function parameter remove buttons use the same accessible name for every row: `aria-label={t("fnRemoveParam")}` at `src/components/problem/function-signature-builder.tsx:197-205`. Test-case remove/show controls repeat generic labels in dynamic rows: `src/app/(public)/problems/create/create-problem-form.tsx:992-996`, `src/app/(public)/problems/create/create-problem-form.tsx:1027-1029`, `src/app/(public)/problems/create/create-problem-form.tsx:1068-1070`, and `src/components/problem/function-test-case-editor.tsx:253-262`. Message values are generic (`messages/en.json:395`, `messages/en.json:464-465`, `messages/en.json:2693`).
- Failure scenario: after adding several function parameters or test cases, screen-reader and voice-control users encounter multiple identical "Remove parameter", "Remove", or "Show" buttons and can easily delete or expand the wrong row.
- Suggested fix: include row context in accessible names: "Remove parameter 2 (nums)", "Remove test case 3", "Show input for test case 1", and "Show expected output for test case 1".

### DSG2-6 - Admin language row actions are off-canvas on mobile

- Severity: Low
- Confidence: High
- Status: Confirmed
- Evidence: At a 390px viewport, DOM metrics for `/dashboard/admin/languages` showed the table wrapper at `clientWidth: 356`, `scrollWidth: 791`, and first row action buttons at x positions around 700. Source keeps the Actions column after Docker Image at `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:430-440` and row actions at `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:500-529`; the shared table wrapper only provides horizontal scrolling (`src/components/ui/table.tsx:7-18`).
- Failure scenario: phone users see language/image status but not the edit/build/remove actions unless they discover horizontal scrolling. The page has no visible affordance that important controls are hidden to the right.
- Suggested fix: on small screens, collapse actions into a visible per-row menu near the language name, make the action column sticky, or render mobile rows/cards with primary actions always in view. If horizontal scroll remains, add a clear affordance and preserve keyboard access.

## Positive / Fixed Since Prior Pass

- Admin language checkboxes and per-row image actions now include row context in accessible names (`src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:453-457`, `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:502-523`).
- Admin language edit/add fields now have visible labels associated with controls (`src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:549-601`, `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:637-735`).
- The submission form's stdin disclosure now exposes `aria-expanded`/`aria-controls`, hides chevrons from assistive tech, and labels the textarea (`src/components/problem/problem-submission-form.tsx:450-470`).
- `LanguageSelector` now localizes the clear-search label (`src/components/language-selector.tsx:64-70`, `src/components/language-selector.tsx:195-203`).
- Dark-mode sanity check on the practice page showed expected dark root class and high-contrast body/nav color pairs; I did not find a confirmed dark/light contrast failure in sampled paths.

## Missed-Issues Sweep

- Re-ran broad searches for `Link > Button`, `Button render={<Link>`, unlabeled `SelectTrigger`, checkboxes, disabled submit patterns, and hardcoded accessible strings. Findings above are the ones with concrete source and/or browser evidence.
- Reviewed mobile public nav with the menu open. It exposes menu state, landmarks, Escape behavior, and navigable links in the accessibility tree; no confirmed focus-trap defect was found there.
- Reviewed current locales. English and Korean are both LTR, so I did not mark missing RTL support as a current defect; adding RTL locales should trigger a separate layout and `dir` audit.
- Auth/login forms had programmatic labels, password reveal naming, and alert output for failed sign-in in the sampled path.
- This was not a full WCAG certification. Contest live participation, recruiting assessment details, all dashboard dialogs, and every empty/error/loading state were sampled through source patterns rather than exhaustively driven in the browser.
