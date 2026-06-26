# Designer UI/UX Review — judgekit (HEAD `0b0ac198`)

**Reviewer:** Designer agent
**Date:** 2026-06-26
**Scope:** Information architecture, affordances, focus/keyboard nav, WCAG 2.2 accessibility, responsive behavior, dark/light correctness, i18n parity, Korean letter-spacing compliance, perceived performance (LCP/CLS/INP), CodeMirror theming, loading/empty/error states.
**Method:** Static code analysis (DOM, selectors, ARIA, computed CSS variables) across `src/components/**`, `src/app/**`, `messages/*.json`, `src/app/globals.css`. Multimodal caveat: no runtime DOM probe; all visual findings are grounded in exact selectors, hex/oklch values, and box metrics derived from code.

**Headline numbers:** 267 tsx files (143 client, 124 server). 2,977 i18n leaf keys per locale with **zero missing-key drift**. ~30 `tracking-*` utility uses — **all correctly gated** by `locale !== "ko"`. Pretendard Variable self-hosted via `next/font/local`. 207 `dark:` variants, only 11 hardcoded colors codebase-wide.

---

## Coverage

| Surface | Examined | Notes |
|---|---|---|
| `src/app/globals.css` | Full 574 lines | Theme tokens, lecture modes, syntax-highlight vars |
| `src/app/layout.tsx`, `(public)/layout.tsx`, `(dashboard)/layout.tsx`, `(auth)/layout.tsx` | Full | Skip-link, main wrapper, Toaster, ThemeProvider |
| `src/components/ui/*` (20 primitives) | Full | Button, Input, Label, Textarea, Dialog, Sheet, Tabs, etc. |
| `src/components/layout/*` | Full | public-header (mobile drawer + nav), locale/theme toggles, skip-to-content |
| `src/components/code/*` | Full | CodeMirror surface, theming, iOS guards |
| All auth forms (`(auth)/*`, `change-password`) | Full file reads | Validation, ARIA, autocomplete |
| All admin forms (`(dashboard)/dashboard/admin/*`) | Sampled deeply | Validation, error feedback, labels |
| Public list/detail pages (`(public)/*`) | Sampled deeply | Loading/empty/error, pagination, responsive |
| `messages/en.json` + `messages/ko.json` | Programmatic diff | Key parity, placeholder parity, ICU usage |
| Every `tracking-*` and `letter-spacing` use | Exhaustive grep | Korean compliance check |
| Every `<h1>` / `<h2>` in admin tree | Exhaustive grep | Heading hierarchy |
| Every `<img>` / `<Image>` | Exhaustive grep | CLS risks |
| Every `loading.tsx` / `error.tsx` / `not-found.tsx` | Exhaustive find | Route boundary coverage |

---

## Severity legend

- **P0 (Critical):** WCAG Level A failure, broken core interaction, or data-loss risk. Blocks ship.
- **P1 (High):** Real usability/a11y harm, AA contrast failure, or dead code that misleads users.
- **P2 (Medium):** Polish gap with measurable UX cost.
- **P3 (Low):** Nit, inconsistency, future maintenance risk.

---

## Strengths to preserve

1. **Korean letter-spacing discipline is exemplary.** Every `tracking-*` utility is gated by `locale !== "ko"` (often with an inline comment documenting the rule). Base CSS at `globals.css:127-137` uses a `--letter-spacing-body` custom property that is reset to `normal` under `html:lang(ko)`. `<html lang={locale}>` at `src/app/layout.tsx:100` correctly feeds that selector. No Korean glyph receives tight tracking anywhere in the audited tree.
2. **Mobile drawer is textbook.** `src/components/layout/public-header.tsx:89-134` implements focus trap with Tab/Shift+Tab wraparound, Escape-to-close with focus restoration, route-change auto-close (RAF-deferred), and a sr-only `aria-live="polite"` announcement when the menu opens (`:165-169`).
3. **Submit-button hygiene is consistent everywhere.** Every mutation button uses `disabled={isPending}` plus label swap; the problem submit form (`src/components/problem/problem-submission-form.tsx:376, 485-487`) adds an in-handler re-entry guard and a `<Loader2 className="animate-spin" />`.
4. **CodeMirror is correctly code-split.** `src/components/code/code-editor.tsx:10-13` uses `next/dynamic({ ssr: false, loading: <CodeEditorSkeleton /> })`; per-language packs (`@codemirror/lang-*`) are dynamically `import()`-ed from `code-surface.tsx:214-220`; `oneDark` is lazy in `editor-themes.ts:1088`.
5. **Pretendard Variable via `next/font/local`** with `display: "swap"` and a CSS variable hook (`src/app/layout.tsx:6, 17-21, 100`). Self-hosted, subsetting handled by Next, no external CSS request.
6. **i18n message parity is flawless.** 2,977 leaf keys in each of `en.json` / `ko.json`; zero structural diff; zero placeholder mismatches; one shared empty string (`admin.files.table.preview`).
7. **`signup-form.tsx:139-175` is the gold standard for field wiring.** It pairs `<Label htmlFor>` + `<Input id>` + `<p id="x-error" role="alert">` + `aria-invalid` + `aria-describedby`. The same pattern is replicated in `system-settings-form.tsx:257-264`.
8. **Status badge is not color-only.** `src/components/submission-status-badge.tsx` renders icon + color + visible abbreviation ("AC"/"WA"/"TLE") + full-name tooltip + `aria-label`.
9. **AbortController hygiene** on auth forms that may re-submit (`forgot-password-form.tsx:15,25-27,64-67`, `reset-password-form.tsx:27,39-41`).
10. **Reduced-motion block at `globals.css:138-145`** covers `animation-duration`, `iteration-count`, `transition-duration`, `scroll-behavior` for every element.

---

## Findings

### D-1 — Light-mode `--muted-foreground` fails WCAG AA contrast (4.5:1)
**Severity:** P0 — WCAG 1.4.3 (Level AA), legal-baseline issue
**Files:** `src/app/globals.css:63`
**Confidence:** High (computed)

The light-mode token is `oklch(0.48 0 0)` on `oklch(1 0 0)` background. Converting OKLab L to relative luminance (Y ≈ L³ for achromatic) gives Y_mf ≈ 0.2212 vs Y_bg = 1.0 → **contrast ratio ≈ 3.87:1**, below the 4.5:1 AA threshold for normal-size body text. Dark mode passes at ~15.9:1.

**Where it bites** (non-exhaustive):
- `src/components/ui/dialog.tsx:143` — `DialogDescription` body copy in every dialog
- `src/components/ui/sheet.tsx:123` — `SheetDescription`
- `src/components/ui/alert-dialog.tsx:113` — `AlertDialogDescription`
- `src/components/ui/dropdown-menu.tsx:68,254` — `DropdownMenuLabel`, shortcut text
- `src/components/ui/tabs.tsx:32` — inactive tab text
- `src/components/layout/public-header.tsx:190` — inactive top-nav links at `text-sm` (normal size, not large)
- `src/app/(auth)/signup/signup-form.tsx:196` — `password-hint` at `text-xs text-muted-foreground` (small text — needs 4.5:1, gets 3.87:1)
- `src/components/empty-state.tsx:18,22` — empty-state description body

**Fix:** darken to `oklch(0.42 0 0)` (≈5.0:1) or `oklch(0.40 0 0)` (≈5.6:1). The high-contrast light variant at `globals.css:454` already uses `oklch(0.40 0 0)` — port that value into `:root`.

---

### D-2 — ~35 `<Label>` siblings have no `htmlFor`/`id` pairing with their input
**Severity:** P0 — WCAG 1.3.1 + 3.3.2 (Level A)
**Files:** pattern across the codebase
**Confidence:** High

`src/components/ui/label.tsx` is a plain `<label>` element — there is no base-ui context auto-association. The shadcn idiom relies on `htmlFor`/`id` pairing. ~35 callsites render `<Label>` as a **sibling** of an `<Input>`/`<Select>` with neither attribute, so the label is unassociated with the field. Screen-reader users hear the field without a name; clicking the label does not focus the field.

**Sample of the worst offenders** (full list compiled by audit):
- `src/lib/plugins/chat-widget/admin-config.tsx:158,172,193,260,295,306` — provider/apiKey/model/assistantName/maxTokens/rateLimit
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:391,399,418` — name/role/expiry
- `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:385,406` — voting title, SMTP section
- `src/app/(dashboard)/dashboard/admin/settings/footer-content-form.tsx:140,149`
- `src/app/(dashboard)/dashboard/admin/settings/home-page-content-form.tsx:129,137,145,160,165`
- `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:196`
- `src/app/(dashboard)/dashboard/admin/tags/tag-form-fields.tsx:54,78`
- `src/app/(dashboard)/dashboard/admin/settings/allowed-hosts-form.tsx:82` — Input has **no label at all**, only `placeholder`
- `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:400` — search Input, **no label**
- `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:429,461,477,497,517,632`
- `src/components/problem/function-signature-builder.tsx:162,264`
- `src/components/problem/function-reference-solution.tsx:156,188`
- `src/components/contest/quick-create-contest-form.tsx:106,115,126,140,151`
- `src/components/contest/recruiting-invitations-panel.tsx:456,464,473,501`

**Fix:** copy the signup pattern — `<Label htmlFor="x">` paired with `<Input id="x">`. Where the design intentionally omits a visible label (search inputs), add `aria-label` or `sr-only` label.

---

### D-3 — Admin heading hierarchy: 11+ pages use `<h2>` as page title, no `<h1>`
**Severity:** P0 — WCAG 1.3.1 (Level A)
**Files:** see below
**Confidence:** High (grepped)

`src/app/(dashboard)/layout.tsx` renders no `<h1>` itself, so each admin page must provide one. The following use a single `<h2 className="text-2xl font-bold">` for the page title with no preceding `<h1>`:

| File:Line | Title text |
|---|---|
| `src/app/(dashboard)/dashboard/admin/workers/page.tsx:26` | `{t("title")}` |
| `src/app/(dashboard)/dashboard/admin/files/page.tsx:129` | files title |
| `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:364` | audit-logs title |
| `src/app/(dashboard)/dashboard/admin/languages/page.tsx:44` | languages title |
| `src/app/(dashboard)/dashboard/admin/tags/page.tsx:58` | tags title |
| `src/app/(dashboard)/dashboard/admin/plugins/page.tsx:23` | plugins title |
| `src/app/(dashboard)/dashboard/admin/login-logs/page.tsx:242` | login-logs title |
| `src/app/(dashboard)/dashboard/admin/settings/page.tsx:441` | settings title |
| `src/app/(dashboard)/dashboard/admin/users/page.tsx:149` | users title |
| `src/app/(dashboard)/dashboard/admin/users/[id]/page.tsx:74` | user detail title |
| `src/app/(dashboard)/dashboard/admin/submissions/page.tsx:307` | submissions title |
| `src/app/(dashboard)/error.tsx:20`, `not-found.tsx:11` | error/404 chrome |
| `src/app/(public)/problems/error.tsx:27` | error chrome |

**Fix:** either (a) change the page-title `<h2>` to `<h1>` on each page, or (b) render an `<h1 className="sr-only">{pageTitle}</h1>` in the dashboard layout and let the visible `<h2>` stay. Option (b) is one-line and consistent.

---

### D-4 — `shadow-[1px_0_0_0_hsl(var(--border))]` is invalid CSS
**Severity:** P1 — broken visual affordance
**Files:** `src/components/contest/leaderboard-table.tsx:346, 349, 395, 414`
**Confidence:** High

`--border` is defined as `oklch(0.922 0 0)` (`globals.css:67`). `hsl(oklch(0.922 0 0))` is invalid CSS — browsers ignore the declaration, so the sticky leaderboard columns have **no right-edge separator line** in either theme.

**Fix:** replace all four with `shadow-[1px_0_0_0_var(--border)]`.

---

### D-5 — Mobile hamburger button is 32×32px (below iOS HIG 44px minimum)
**Severity:** P1 — touch-target regression
**Files:** `src/components/layout/public-header.tsx:259`
**Confidence:** High

```tsx
className="inline-flex size-8 items-center justify-center rounded-md ..."
```

`size-8` = 32×32px. The adjacent `ThemeToggle` at `src/components/layout/theme-toggle.tsx:78` deliberately uses `size-11 lg:size-9` (44px mobile / 36px desktop) with an inline comment documenting the iOS HIG / Material 48dp rule. The hamburger was missed by the same audit. WCAG 2.5.8 AA (24px) passes; 2.5.5 AAA (44px) fails.

**Fix:** match the theme toggle pattern — `className="inline-flex size-11 items-center justify-center rounded-md lg:size-9 ..."`.

---

### D-6 — `change-password` form has no `autoComplete` on any of three password fields
**Severity:** P1 — password-manager UX regression
**Files:** `src/app/change-password/change-password-form.tsx:103-133`
**Confidence:** High (verified via grep — only `type="password"` returned)

The current-password field should be `autoComplete="current-password"`; the new-password and confirm fields should be `autoComplete="new-password"`. None are set. Without these tokens password managers will not offer to generate or fill a new password, and may mis-categorize the fields.

Also (same file): `minLength={8}` is hardcoded at `:117, :129` instead of importing `FIXED_MIN_PASSWORD_LENGTH` from `src/lib/security/password.ts:1` — drift risk if the policy changes.

**Fix:** add the autocomplete tokens; replace `8` with `FIXED_MIN_PASSWORD_LENGTH`. The login (`login-form.tsx:68,80`) and signup (`signup-form.tsx:133,155,173,189,206`) forms already follow the correct pattern — port it.

---

### D-7 — Recruit start form has no `<form>` element; Enter does not submit
**Severity:** P1 — broken keyboard interaction
**Files:** `src/app/(auth)/recruit/[token]/recruit-start-form.tsx:116-148`
**Confidence:** High

The component renders a `<div className="space-y-3">` (`:116`) wrapping a password `<Input>` and a submit `<Button>`. The button has no `type` and is wired only via `onClick={handlePrimaryAction}` (`:137`). Pressing Enter while focused in the password field does nothing — confirmed by zero matches for `<form` or `type="submit"` in the file.

Additionally, the error `<p>` at `:146-148` has no `role` and no `aria-live`, and the password input has no `aria-invalid`/`aria-describedby`.

**Fix:** wrap the controls in `<form onSubmit={handlePrimaryAction}>` and `e.preventDefault()` inside; give the button `type="submit"`; promote the error `<p>` to `<p role="alert" aria-live="polite">`. The signup form is the in-repo template.

---

### D-8 — `EmptyState` component is built but barely used; no public empty state has a CTA
**Severity:** P1 — wayfinding gap
**Files:** `src/components/empty-state.tsx` (definition) + 25 callsites
**Confidence:** High

`<EmptyState icon title description? action? />` supports an icon, description, and CTA button — but only **3** of ~25 empty lists use it (all admin: `audit-logs/page.tsx:562`, `tags/page.tsx:109`, `admin/submissions/page.tsx:503`), and **none of those three pass `description` or `action`**. Every other empty list is a bare `<TableCell colSpan={N}>{label}</TableCell>` or `<p>{label}</p>`:

- `src/app/(public)/problems/page.tsx:747-753` — "noProblems"
- `src/app/(public)/submissions/page.tsx:518-524` — "noSubmissions"
- `src/app/(public)/rankings/page.tsx:260-263`
- `src/app/(public)/groups/page.tsx:310-316`
- `src/app/(public)/problem-sets/page.tsx:110-116`
- `src/app/(public)/users/[id]/page.tsx:272-274` — "noSolvedProblems" with no "browse problems" CTA
- `src/app/(public)/_components/public-contest-list.tsx:60-63`, `public-problem-list.tsx:110-113`
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:446-448`, `workers-client.tsx:340-342`, `files/file-management-client.tsx:225-228`, `login-logs/page.tsx:387-393`

**Fix:** swap the bare `<TableCell>` branches for `<EmptyState>` with a meaningful icon and a CTA — e.g. "no submissions" → icon + "Submit your first solution" linking to `/practice`.

---

### D-9 — `submission-list-auto-refresh.tsx` returns `null` — auto-refresh is invisible
**Severity:** P1 — perceived-staleness gap
**Files:** `src/components/submission-list-auto-refresh.tsx:114`
**Confidence:** High

The mechanism is sound: abort previous request, exponential backoff up to 60s, skip when tab hidden, guard against concurrent ticks. But the component returns `null`, so users have **no way to tell** whether the list is "fresh" or "stale". The list silently mutates when `router.refresh()` resolves.

Used by `src/app/(public)/submissions/page.tsx:329` and `src/app/(dashboard)/dashboard/admin/submissions/page.tsx:306`.

**Fix:** render a small affordance — either a `<span role="status" aria-live="polite">` showing "Updated 3s ago" with a `relativeTime` formatter, or a subtle progress bar / spinner during the in-flight tick. The contest manage page (`contests/manage/[assignmentId]/page.tsx:383`) has a comment noting auto-refresh every 15s — same gap.

---

### D-10 — Many routes have no route-level `error.tsx` or `loading.tsx`
**Severity:** P1 — unhandled server-component failures render Next.js default chrome
**Files:** see below
**Confidence:** High

Existing boundaries:
- `loading.tsx` — `(public)/loading.tsx`, `(public)/problems/loading.tsx`, `(public)/groups/loading.tsx`, `(public)/contests/manage/loading.tsx`, `(public)/contests/manage/[assignmentId]/participant/loading.tsx`, `(dashboard)/loading.tsx`, `(dashboard)/dashboard/admin/loading.tsx`, `(dashboard)/dashboard/admin/users/loading.tsx`, `(dashboard)/dashboard/admin/submissions/loading.tsx`, `(auth)/recruit/[token]/results/loading.tsx`
- `error.tsx` — `(public)/problems/error.tsx`, `(public)/groups/error.tsx`, `(public)/contests/manage/error.tsx`, `(dashboard)/error.tsx`, `(dashboard)/dashboard/admin/error.tsx`

**Missing `loading.tsx`** (today users see a bare 50vh spinner with no content shape — not the worst, but for the primary solve page it is jarring):
- `/practice` and `/practice/problems/[id]` — **the main problem-solving page** has no skeleton
- `/practice/sets`, `/practice/sets/[id]`
- `/submissions`, `/submissions/[id]`
- `/contests`, `/contests/[id]`
- `/community`, `/community/threads/[id]`, `/community/new`
- `/users/[id]`, `/problem-sets`, `/problem-sets/[id]`, `/rankings`, `/dashboard`, `/profile`, `/playground`, `/languages`, `/privacy`

**Missing `error.tsx`** (these fall through to Next.js's default error UI when a server component throws):
- `/submissions`, `/practice/*`, `/contests`, `/contests/[id]`, `/community/*`, `/users/[id]`, `/problem-sets/*`, `/rankings`, `/dashboard`, `/profile`, `/playground`

Also: there is no `app/error.tsx` root boundary — only `app/not-found.tsx`.

**Fix:** add per-route `loading.tsx` (mirror the 8-row skeleton template used elsewhere) and `error.tsx` (mirror `(dashboard)/error.tsx`). Priority 1: `/practice/problems/[id]` and `/contests/[id]`.

---

### D-11 — Pagination shows no total count on most lists
**Severity:** P2 — wayfinding
**Files:** `src/components/pagination-controls.tsx:50-151` + callsites
**Confidence:** High

The component has first/prev/numbers/next/last + page-size selector, but exposes **no `total` / `rangeStart` / `rangeEnd` props**. Each page must render the count text itself, and most don't:

- **Shows total:** `(public)/problems/page.tsx:666`, `(public)/practice/page.tsx:692`, `(dashboard)/admin/users/page.tsx:204`, `(dashboard)/admin/audit-logs/page.tsx:458`
- **Shows range only (no total):** `(public)/submissions/page.tsx:456` — users never learn how many total submissions match the filter
- **Shows nothing at all:** `(public)/rankings/page.tsx`, `(public)/groups/page.tsx`, `(public)/problem-sets/page.tsx`, `(public)/contests/page.tsx`, `(public)/contests/manage/page.tsx`, `(dashboard)/admin/submissions/page.tsx`, `(dashboard)/admin/files/page.tsx`, `(dashboard)/admin/login-logs/page.tsx`

No "no more results" end-of-list indicator anywhere.

**Fix:** add `total`, `rangeStart`, `rangeEnd` props to `<PaginationControls>` and render `Showing X–Y of Z` in one place. Falling that, have each callsite render the count text — the `pagination.showingRange` i18n key already supports `{start, end, total}` placeholders.

---

### D-12 — Live markdown preview re-parses on every keystroke (INP)
**Severity:** P2 — perceived performance on the create-problem form
**Files:** `src/app/(public)/problems/create/create-problem-form.tsx:630, 664`
**Confidence:** Medium

The "Preview" tab renders `<ProblemDescription description={description} />` where `description` is set on every `onChange` of the textarea (`:630`). Each keystroke runs `ReactMarkdown` + `rehype-highlight` + `rehype-katex` + `remark-math` + `remark-gfm` + `remark-breaks` on the whole document. For a long problem statement with code blocks and LaTeX, this is **easily 50–200 ms per keystroke**.

Compounded by `src/components/problem-description.tsx:44-60` running **7 un-anchored multiline regexes** on the description on every render to decide HTML-vs-markdown mode — currently unmemoized.

**Fix:** wrap the preview in `useDeferredValue(description)` so React yields between keystrokes, or debounce the preview value (300 ms). Memoize the regex-decision block with `useMemo([description])`. Verify the shadcn Tabs `forceMount=false` default so the preview tab unmounts when inactive (it does in `src/components/ui/tabs.tsx`).

---

### D-13 — 336 KB of locale JSON shipped to the client on every route
**Severity:** P2 — bundle weight
**Files:** `src/app/layout.tsx:92, 119`
**Confidence:** High

`messages/en.json` = 160 KB, `messages/ko.json` = 176 KB. `<NextIntlClientProvider messages={messages}>` wraps `<body>`, so **every page receives the entire dictionary**. next-intl does not split per route by default.

**Fix:** use `getMessages({ namespace })` or a loader to ship only the namespaces each route uses. The biggest wins are on code-editor routes (`/practice/problems/[id]`) where the entire `admin.*` and `dashboard.*` namespaces are dead weight.

---

### D-14 — `react-markdown` + `rehype-highlight` + `rehype-katex` + `katex.min.css` imported eagerly
**Severity:** P2 — bundle weight on first paint
**Files:** `src/components/problem-description.tsx:2-8`, `src/components/assistant-markdown.tsx:2-10`
**Confidence:** High

Both files do top-level `import` of the markdown pipeline. `problem-description.tsx` is used on every problem detail page **and** in the live preview tab of the create-problem form.

**Fix:** wrap in `next/dynamic({ ssr: false })`. The CodeMirror team already did this for the editor (`code-editor.tsx:10-13`) — same pattern applies.

---

### D-15 — `highlight.js/lib/common` (~35 languages) imported eagerly in timeline panel
**Severity:** P2 — bundle weight
**Files:** `src/components/contest/code-timeline-panel.tsx:5-6`
**Confidence:** High

Both `import hljs from "highlight.js/lib/common"` and `import "highlight.js/styles/github.css"` are top-level. The panel renders per timeline event on contest analytics pages.

**Fix:** lazy-load via `await import("highlight.js/lib/common")` on first render.

---

### D-16 — `accepted-solutions.tsx` CodeViewer is missing `aria-label`
**Severity:** P2 — WCAG 4.1.2
**Files:** `src/components/problem/accepted-solutions.tsx:186`
**Confidence:** High

```tsx
<CodeViewer language={solution.language} minHeight={220} value={solution.sourceCode} />
```

Every other CodeViewer callsite passes `ariaLabel` or `ariaLabelledby` (`function-reference-solution.tsx:170`, `problem-submission-form.tsx:435`, `submission-detail-client.tsx:313`, `submission-result-panel.tsx:42,94`, `compiler-client.tsx:415`). This one is the only unlabelled editor in the codebase — screen-reader users hear "edit text" with no name.

**Fix:** add `ariaLabel={t("acceptedSolutionEditor", { language: solution.language })}` or similar.

---

### D-17 — Dead `not-found.tsx` at `(public)/problems/[id]/not-found.tsx`
**Severity:** P2 — dead code
**Files:** `src/app/(public)/problems/[id]/page.tsx` (1-21), `src/app/(public)/problems/[id]/not-found.tsx`
**Confidence:** High (verified)

`(public)/problems/[id]/page.tsx` is a pure redirect stub to `/practice/problems/${id}` — it never calls `notFound()`. The dedicated `not-found.tsx` next to it is unreachable.

**Fix:** delete `src/app/(public)/problems/[id]/not-found.tsx`.

---

### D-18 — Vote buttons are not optimistic; score doesn't move until server replies
**Severity:** P2 — perceived responsiveness
**Files:** `src/components/discussions/discussion-vote-buttons.tsx:41-101`
**Confidence:** High

The score state is updated only after the server responds (`:63-64`). The button is correctly `disabled` while waiting (`:88, :101`) — preventing double-votes — but the user sees no immediate feedback on their own vote.

**Fix:** wrap the score state in `useOptimistic` so the score updates on click, then reconcile on response. React 19 + the existing `useTransition` pattern in the codebase makes this a small change.

---

### D-19 — Admin form validation: no `aria-invalid`/`aria-describedby` anywhere except one field
**Severity:** P2 — WCAG 3.3.1 + 4.1.3
**Files:** pattern across admin forms
**Confidence:** High

`system-settings-form.tsx:257-258` is the **only** admin input with field-level `aria-invalid` + `aria-describedby` wiring (the time-zone field). Every other admin form (add-user, edit-user, role-editor, tag editor, footer/home-page content, allowed-hosts, database-backup-restore, api-keys, bulk-create, config-settings) reports errors **only via toast**. Screen-reader users hear nothing inline.

Also: `add-user-dialog.tsx:90,127` and `edit-user-dialog.tsx:96,128` lack `minLength`/`pattern`/`maxLength` despite server enforcement — clients submit then toast the server error.

**Fix:** replicate the signup pattern (`aria-invalid={!!err || undefined}` + `aria-describedby={err ? "x-error" : undefined}` + `<p id="x-error" role="alert">`) on each admin field.

---

### D-20 — `change-password` error region lacks `aria-live`; no show/hide toggle; no password-requirement hint
**Severity:** P2 — UX inconsistency
**Files:** `src/app/change-password/change-password-form.tsx:83-96, 113-121, 147-149`
**Confidence:** High

Three small inconsistencies vs. the login/reset forms:
1. `:147-149` error `<p>` has `role="alert"` but no `aria-live="polite"` — login/forgot/reset all have it.
2. `:113-121, :125-133` password inputs have **no show/hide toggle** — login (`login-form.tsx:84-95`) and reset (`reset-password-form.tsx:131-142`) both do.
3. The new-password field has **no requirement hint** — the user only discovers the 8-char floor by failing. Contrast signup's `password-hint` (`signup-form.tsx:196-198`).

**Fix:** add `aria-live="polite"` to the error region, add the show/hide toggle pattern, and add `<p id="password-hint" className="text-xs text-muted-foreground">{t("passwordHint", { min: FIXED_MIN_PASSWORD_LENGTH })}</p>` with `aria-describedby="password-hint"`.

---

### D-21 — Auth form loading state is text-only ("...ing") on every form except `verify-email`
**Severity:** P2 — perceived-responsiveness inconsistency
**Files:** `(auth)/login/login-form.tsx:103`, `(auth)/signup/signup-form.tsx:236`, `(auth)/forgot-password/forgot-password-form.tsx:105`, `(auth)/reset-password/reset-password-form.tsx:178`, `change-password/change-password-form.tsx:150`
**Confidence:** High

Every auth submit button swaps its label (`t("signingIn")`, `t("sending")`, etc.) but renders **no spinner icon**. Only `verify-email/page.tsx:80` shows `<Loader2 className="size-4 animate-spin" />`. The problem-submission form, dialogs, and admin actions all show spinners — auth is the lone holdout.

**Fix:** prepend `<Loader2 className="mr-2 size-4 animate-spin" />` to the button children when `loading`/`isPending` is true.

---

### D-22 — Chart tokens (`--chart-1..5`) are identical in `:root` and `.dark`
**Severity:** P3 — design consistency
**Files:** `src/app/globals.css:70-74` vs `105-109`
**Confidence:** High

Charts do not adapt to theme. The values `oklch(0.809 0.105 251.813)` through `oklch(0.424 0.265.638)` are a reasonable blue ramp on both backgrounds (the `0.424` dark end reads on both), so it's not a contrast bug — but dark mode could carry a more vivid ramp.

**Fix:** optional — define a separate `.dark` chart ramp tuned for `oklch(0.145 0 0)` background.

---

### D-23 — Lecture-mode `solarized` overrides page chrome and problem-description syntax colors but NOT the CodeMirror editor
**Severity:** P3 — cross-mode visual mismatch
**Files:** `src/components/lecture/lecture-mode-provider.tsx:57-64` vs `src/components/code/code-surface.tsx:469-481`
**Confidence:** High

`lecture-theme-solarized` redefines `--problem-code-*` and base tokens in `globals.css:474-503`, but the editor's syntax colors come from a binary switch between `oneDarkHighlightStyle` and `materialLightHighlightStyle` keyed on `resolvedTheme` (next-themes). Selecting the solarized lecture theme themes the page chrome solarized while the editor stays on whatever `resolvedTheme` says.

**Fix:** either (a) document that the editor follows the user's editor theme preference (intentional separation), or (b) drive the editor's highlight selection from lecture mode state as well. Option (a) is probably correct — the editor already has a per-user theme picker (`editor-theme-picker.tsx`).

---

### D-24 — `discussions/*` has zero responsive prefixes across all 9 files
**Severity:** P3 — likely mobile crowding
**Files:** `src/components/discussions/*` (all 9 files)
**Confidence:** Medium

No `sm:`, `md:`, or `lg:` prefixes. Vote-button rows and thread lists may crowd on narrow screens. No confirmed breakage since the components rely on parent flex/grid — but a manual mobile pass is warranted.

**Fix:** spot-check on a 360px viewport; add `flex-wrap` / `flex-col sm:flex-row` where vote button rows wrap poorly.

---

### D-25 — `inputMode` unused on every numeric field except one
**Severity:** P3 — mobile keyboard UX
**Files:** pattern; only used at `src/app/(public)/groups/[id]/assignments/[assignmentId]/exam-extend-dialog.tsx:121`
**Confidence:** High

Numeric admin fields (time limit, memory limit, difficulty, SMTP port, role level, config values) use `type="number"` and rely on the browser's number spinner. `inputMode="numeric"` on `type="text"` would avoid the spinner UI on desktop and is the modern recommendation.

**Fix:** per-field, low priority. The `type="number"` works correctly; this is purely a polish issue.

---

### D-26 — hCaptcha is on signup only; no captcha on login, forgot-password, reset, change-password
**Severity:** P3 — security/UX consideration
**Files:** `src/app/(auth)/signup/signup-form.tsx:122-129, 224-229`
**Confidence:** High

Rate-limiting is server-side and surfaced generically (e.g. `forgot-password-form.tsx:51 rateLimited`). Reset/change-password have **no rate-limit signal at all** in the UI. This is acceptable if the security posture relies on server-side throttling + the reset-token flow being inherently rate-limited — but worth flagging for explicit threat-model review.

---

### D-27 — NextAuth credentials form labels are hardcoded English
**Severity:** P3 — i18n gap (low impact)
**Files:** `src/lib/auth/config.ts:172-175`
**Confidence:** High

```ts
credentials: {
  username: { label: "Username or Email", ... },
  password: { label: "Password", ... },
  recruitToken: { label: "Recruiting Token", ... },
  recruitAccountPassword: { label: "Recruiting Account Password", ... },
}
```

These labels render on NextAuth's hosted pages, which most users never see because the app uses a custom `login-form.tsx`. But if the hosted form is ever reached (e.g. direct hit to `/api/auth/signin`), it shows English in the Korean locale.

**Fix:** if the hosted form is unreachable by design (CSP/route guard), document it. Otherwise wire `getTranslations` into the config.

---

### D-28 — Two SVG `aria-label`s and one chat-widget label are hardcoded English
**Severity:** P3 — i18n
**Files:**
- `src/components/contest/analytics-charts.tsx:90` — `aria-label="Score distribution bar chart"`
- `src/components/contest/analytics-charts.tsx:321` — `aria-label="Problem solve times chart"`
- `src/lib/plugins/chat-widget/chat-widget.tsx:289` — `aria-label="Chat"`

**Confidence:** High

Screen-reader users in the Korean locale hear these in English.

**Fix:** route through `useTranslations` and add ko entries.

---

### D-29 — OG image declares `Inter` font but never fetches it; falls back to runtime default
**Severity:** P3 — visual inconsistency on social cards
**Files:** `src/app/og/route.tsx:39, 51`
**Confidence:** High

`ImageResponse` is constructed with only `size`; the inline styles declare `fontFamily: "Inter, Arial, sans-serif"`. Inter is not loaded anywhere in the app (the app uses Pretendard), and `next/og` requires an explicit `fonts: [{ name, data, weight }]` array to use a custom font. Result: OG images render in the runtime's fallback.

**Fix:** either fetch Pretendard woff2 and pass it via `fonts`, or align the declared family with what the runtime ships.

---

### D-30 — SEO hreflang `?locale=ko` URL is generated for crawlers but not consulted by `getRequestConfig`
**Severity:** P3 — SEO consistency
**Files:** `src/lib/locale-paths.ts` (buildLocalePath) vs `src/i18n/request.ts`
**Confidence:** High

The `?locale=ko` hreflang URL is in metadata, but `getRequestConfig` resolves locale via `x-locale-override` header → cookie → `accept-language` → system setting default → `"en"`. A human hitting `?locale=ko` directly still resolves via cookie/Accept-Language.

**Fix:** either consume the `locale` search param inside `request.ts`, or stop generating the `?locale=ko` hreflang URL and rely on `accept-language` + the cookie.

---

### D-31 — Korean honorific register mixes 해요체 and 하십시오체 within the same namespace
**Severity:** P3 — copy polish
**Files:** `messages/ko.json` (esp. `auth.*`)
**Confidence:** High

Rough counts across all 2,899 Korean strings: **279 해요체**, **143 하십시오체**, 2,477 noun/short-label. Within the `auth.*` namespace:
- `auth.signInDescription` → "계정에 로그인**하세요**" (하십시오체)
- `auth.signUpDescription` → "공개 사용자 계정을 만들**어요**" (해요체)
- `auth.passwordHint` → "...만들어 **주세요**" (하십시오체)
- `auth.invalidEmail` → "...입력**하세요**" (하십시오체)

Plus two stiff calques: `admin.settings.loginRateLimitWindowMsHint` "시간 창" (literal "time window"), and `problems.fnFloatRelativeErrorHint` "~입니다" in a tooltip.

**Fix:** standardize on **하십시오체** for imperatives/errors and **해요체** for status/toasts, or pick one throughout. Replace "시간 창" with "시간 범위" or "기간".

---

### D-32 — `workers-client.tsx` admin table — verify `overflow-x-auto` wrapper
**Severity:** P3 — possible mobile horizontal-scroll bug
**Files:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx` (~line 343)
**Confidence:** Low (unverified)

Every other admin table wraps its `<Table>` in `<div className="overflow-x-auto">` (audit-logs:462, login-logs:328, users:207, files:138). The workers table was not confirmed to have the wrapper in the immediate grep output. If missing, columns overflow the viewport on mobile.

**Fix:** verify and add `<div className="overflow-x-auto">` wrapper if absent.

---

## Information architecture notes (no findings, observations)

- **Top-level IA is sound.** Public nav = Problems / Submissions / Contests / Rankings / Groups / Playground / Problem-sets / Practice / Users / Profile / Languages. Admin under `/dashboard/admin/*` with `Users / Submissions / Workers / Files / Tags / Languages / Audit logs / Login logs / Plugins / API keys / Settings`. Each list page has filter + search + pagination; each detail page has clear primary action.
- **Two dashboards** is initially confusing: `/dashboard` (user-facing role-aware cards) vs `/dashboard/admin` (admin tools). The header dropdown surfaces both. Worth a quick UX test with new admin users.
- **`/problems` vs `/practice`** — `/problems` is the legacy list route, `/practice/problems` is the solve route, `/practice/problems/[id]` is the detail page. The legacy `/problems/[id]` is a pure redirect stub (D-17). The split is fine but the URL story could be simplified.
- **The unused `src/components/ui/sidebar.tsx`** (709 lines, shadcn pattern) is shipped but has zero callsites — the actual chrome is `public-header.tsx`. Either delete it or wire it up; carrying 700 lines of dead UI primitive code is a maintenance liability.

---

## Affordance notes

- `src/components/ui/button.tsx:9` correctly applies `cursor-pointer` on buttons and `disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50` on disabled — good.
- `src/components/ui/input.tsx:12` mirrors the disabled affordance.
- Focus rings: every interactive primitive has `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. Strong, consistent keyboard affordance.
- Hover states: nav links use `hover:bg-accent hover:text-accent-foreground`. Buttons use `hover:bg-primary/90` etc. No dead hover states.

---

## CodeMirror theming notes

- `src/components/code/code-surface.tsx:316` reads `resolvedTheme` from `next-themes` and switches `oneDarkHighlightStyle` ↔ `materialLightHighlightStyle` via the highlight compartment (`:469-481`). Correct.
- `baseTheme` at `:50-93` uses `var(--code-surface-background)`, `var(--code-surface-caret)`, `var(--code-surface-foreground)`, `var(--code-surface-selection)`, `var(--code-surface-gutter)`, `var(--code-surface-border)`, `var(--code-surface-placeholder)` — all defined in `globals.css:170-198` with `color-mix` overrides in `.code-surface-danger`.
- iOS guards at `:171-175` disable `drawSelection()` on iPad/iPhone (UIKit conflict).
- `autocapitalize: "off"`, `autocorrect: "off"`, `spellcheck: "false"` at `:292-294`.
- `EditorView.lineWrapping` on by default (`:307`).
- Escape binding at `:197-203` blurs the editor — explicitly cited as WCAG 2.1.2 "No Keyboard Trap".
- `Mod-Enter` submit shortcut at `:356-362` — won't fire on soft keyboards; mobile users tap submit.
- 36 editor themes registered in `src/lib/code/editor-themes.ts` with `isDark` flag for light/dark categorization. Default light theme (`material-lighter`) defined inline at `code-surface.tsx:96-134` with accessible contrast (`#7C4DFF` keyword on `var(--code-surface-background)`).

---

## Quick-win fix priority

| ID | Severity | Effort | Fix |
|---|---|---|---|
| D-1 | P0 | 1 line | `--muted-foreground: oklch(0.42 0 0)` in `:root` |
| D-3 | P0 | 11 lines | `<h2>` → `<h1>` (or add sr-only `<h1>` in dashboard layout) |
| D-2 | P0 | ~35 sites | Add `htmlFor`/`id` pairs |
| D-4 | P1 | 4 lines | Replace `hsl(var(--border))` with `var(--border)` |
| D-5 | P1 | 1 line | `size-8` → `size-11 lg:size-9` |
| D-6 | P1 | 3 attrs | Add `autoComplete` to change-password fields |
| D-7 | P1 | ~10 lines | Wrap recruit form in `<form onSubmit>`; promote error `<p>` to `role="alert"` |
| D-8 | P1 | ~25 sites | Swap bare `<TableCell colSpan>` for `<EmptyState>` with CTA |
| D-9 | P1 | ~30 lines | Render timestamp/spinner in auto-refresh component |
| D-10 | P1 | ~20 files | Add `loading.tsx` and `error.tsx` to listed routes |
| D-16 | P2 | 1 line | Add `ariaLabel` to CodeViewer |
| D-17 | P2 | delete file | Remove dead `not-found.tsx` |
| D-20 | P2 | ~10 lines | Add `aria-live`, show/hide, hint to change-password |
| D-21 | P2 | 5 sites | Prepend `<Loader2 animate-spin>` to auth buttons |

---

## Final checklist verdict

- Information architecture: **Pass** (minor nav simplification possible)
- Affordances: **Pass** (consistent hover/focus/disabled states)
- Focus/keyboard nav: **Pass** (mobile drawer, ESC, focus restoration, no keyboard traps)
- WCAG 2.2 accessibility: **Fail** — D-1 (AA contrast), D-2 (Level A labels), D-3 (Level A headings)
- Responsive: **Pass with caveats** — D-5 (hamburger target), D-24 (discussions)
- Loading/empty/error states: **Fail** — D-8, D-9, D-10
- Form validation UX: **Mixed** — auth forms strong (except D-6, D-7, D-20, D-21); admin forms weak (D-19)
- Dark/light mode correctness: **Pass** — minor D-22, D-23
- i18n parity: **Pass** — minor D-27, D-28, D-30, D-31
- Korean letter-spacing compliance: **Pass** — exemplary
- Perceived performance: **Mixed** — D-12 (INP), D-13 (bundle), D-14, D-15 (lazy-load)
- CodeMirror theming: **Pass** — best-in-class
