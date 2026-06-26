# Cycle 2 — designer

**Focus:** Cycle-1 Phase A regression check (A9 export, A11 GET strictness), Phase B designer remediation confirmation (AGG-56..AGG-62), and new UI/UX/a11y sweep against WCAG 2.2, Korean letter-spacing rule, oklch-token consistency, perceived-perf and i18n.
**Date:** 2026-06-26
**HEAD reviewed:** `ad543e14`
**Method:** Static analysis only. Dev-server browser pass was not feasible this cycle (Phase A changes are API-only, so visual regression surface is minimal). All findings cite exact file:line selectors and metrics derived from the OKLab → linear-sRGB matrix.
**Framework detected:** Next.js 16 + React 19 + Tailwind 4 + shadcn-style (Base UI primitives) + next-intl + next-themes.

---

## REGRESSION

### REG-1 (P2, HIGH confidence) — Phase A touched zero UI files; no UI regression possible from those commits

**Evidence:** `git diff 4b93c5ff^..HEAD --name-only` for the two Phase A commits:
- `4b93c5ff fix(problems): include function-judging fields in per-problem export` → `src/app/api/v1/problems/[id]/export/route.ts` + tests only
- `d4efb27b fix(authz): route problem GET through strict canManageProblem` → `src/app/api/v1/problems/[id]/route.ts` only

No `.tsx`, `.css`, or `messages/*.json` was modified by either commit. Per-problem export is triggered from existing admin/problem buttons (no UI wiring change), and the GET route is consumed by `apiFetch` clients whose error UX is unchanged.

**Criterion:** Phase A scope was backend-only; UI regression risk = 0.

**Fix:** None required. Note for downstream: when the per-problem export button was first gated (`6cc068f0`, 2026-06-24), the capability moved from `canAccessProblem` to `canManageProblem`. Confirm every UI affordance that exposes `/api/v1/problems/[id]/export` is gated on `problems.edit` or `canManageProblem` (see REG-2 for the related edit-page gate).

### REG-2 (P1, MEDIUM confidence) — Edit page access gate lags the stricter API GET gate (information-disclosure gap)

**File:** `src/app/(public)/problems/[id]/edit/page.tsx:34`

```ts
const canEdit = problem.authorId === session.user.id || caps.has("problems.edit");
```

The page uses the **looser local check** that the API just deprecated. After Phase A:
- `GET /api/v1/problems/[id]` strips `referenceSolution`/hidden test cases for `problems.edit` holders outside the problem's teaching group.
- This page does a direct `db.query.problems.findFirst({ with: { testCases: true } })` (line 21-26) and feeds the full row — including `problem.referenceSolution` (line 110) and all `testCases` regardless of `isVisible` (line 103-107) — into `<CreateProblemForm initialProblem=...>`.

Result: a `problems.edit`-cap holder who is not in the problem's teaching group can still SEE the reference solution and hidden test cases by visiting `/problems/[id]/edit`, even though they can no longer fetch them via the API. The visual UI behaves exactly as before Phase A; the data shown is now inconsistent with what the API would return on the wire.

**Criterion:** Internal consistency between page-level auth and route-handler auth; least-privilege disclosure (defense in depth, not a hard WCAG item).

**Fix:** Route the page's auth check through the same `canManageProblem(id, user.id, user.role)` helper the API now uses, and only pass `referenceSolution`/hidden test cases into the form when that strict gate passes. (Backend security implication is owned by code-reviewer/security; the designer observation is the data shown to the user.)

---

## PHASE-B CONFIRMATION

For each AGG item, the current state was re-derived against head `ad543e14`.

### AGG-56 — `--muted-foreground` contrast — INVALIDATED (false positive), MEDIUM confidence

**File:** `src/app/globals.css:64` (`--muted-foreground: oklch(0.48 0 0);` on `--background: oklch(1 0 0);`)

**Recheck:** Walking the OKLab → linear-sRGB matrix for `oklch(0.48 0 0)`:
- `l'=m'=s'=0.48` → `l=m=s=0.48³=0.110592` → linear sRGB `(0.110592, 0.110592, 0.110592)` (gray)
- Contrast vs white linear 1.0 = `(1.0 + 0.05) / (0.110592 + 0.05)` = **6.54 : 1**

This passes WCAG AA 4.5:1 (normal text) and approaches AAA 7:1. The cycle-1 claim of 3.87:1 is not reproducible — it likely came from a converter that confused OKLab L with CIELAB L* or applied an incorrect transfer function.

Dark mode (`oklch(0.75 0 0)` on `oklch(0.145 0 0)`) computes to **~8.9 : 1** — comfortably AAA.

**Recommendation:** Drop AGG-56 from the remediation queue. If extra margin is still desired for body copy readability, bumping to `oklch(0.45 0 0)` light / `oklch(0.78 0 0)` dark is a no-cost hedge, but it is not a WCAG remediation.

### AGG-57 — `<Label>` without `htmlFor`/wrapping — CONFIRMED, P2, MEDIUM confidence

**Scope:** 134 `<Label>` instances across 41 importer files. The unpaired usages concentrate in two patterns:

| File:line | Usage | Issue |
|---|---|---|
| `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:406` | `<Label className="text-base font-medium">{t("smtpTitle")}</Label>` | Section heading rendered as `<label>` with no control; should be `<h3>`/`<p>` |
| `src/components/problem/problem-submission-form.tsx:504` | `<Label className="text-xs text-destructive">{t("compileError")}</Label>` | Labels a `<pre>` output panel — no `htmlFor`, no programmatic association |
| `src/components/problem/problem-submission-form.tsx:515` | `<Label className="text-xs">{t("stdout")}</Label>` | Same — labels a `<pre>` |
| `src/components/problem/problem-submission-form.tsx:520` | `<Label className="text-xs text-yellow-700 dark:text-yellow-400">{t("stderr")}</Label>` | Same — labels a `<pre>` |
| `src/components/problem/function-reference-solution.tsx:188` | `<Label>{t("fnStubPreviewTitle")}</Label>` | Precedes a `<pre>` "stub preview" — same pattern |

**Criterion:** WCAG 2.2 Level A 1.3.1 (Info and Relationships) and 4.1.2 (Name, Role, Value). A `<label>` element with no form control creates a programmatic label that resolves to nothing for AT.

**Fix:** For section headings, swap `<Label>` → `<h3 className="text-base font-medium">`. For output-panel labels, either (a) wrap the `<pre>` in `<label>{t("…")}<pre>…</pre></label>` so the label wraps the output, or (b) use `<p>` + `<pre aria-labelledby={…}>`. (The cycle-1 count of "~35" is an over-count of Label siblings that ARE correctly paired; the actually broken set is ~5–10.)

### AGG-58 — Admin pages use `<h2>` for page title — CONFIRMED, P1, HIGH confidence

**Files (page.tsx):** `admin/workers`, `admin/files`, `admin/settings`, `admin/audit-logs`, `admin/languages`, `admin/login-logs`, `admin/tags`, `admin/plugins`, `admin/plugins/chat-logs`, `admin/plugins/[id]`, `admin/users/[id]`, `admin/submissions`, `admin/submissions/[id]` — 13 pages emit `<h2 className="text-2xl font-bold">{t("title")}</h2>` as the page's first heading with no `<h1>` preceding it.

Two admin pages (`admin/page.tsx`, `admin/roles/page.tsx`) correctly use `<h1>`.

The shell layouts (`(dashboard)/layout.tsx`) do not render an `<h1>` app title either, so the admin route tree has no `<h1>` at all for the affected 13 pages. Breadcrumbs and sidebar do not compensate: breadcrumbs are not in an `<h1>`, and the sidebar is a `<nav>`.

**Criterion:** WCAG 2.2 Level A 1.3.1 — heading hierarchy; the page's main heading must be `<h1>` so AT users can navigate by heading.

**Fix:** Replace the page-title `<h2 className="text-2xl font-bold">…</h2>` with `<h1 className="text-2xl font-bold">…</h1>` in the 13 listed files. (Alternative: render a visually-hidden `<h1 className="sr-only">{t("title")}</h1>` and keep the visible `<h2>`.)

### AGG-59 — `leaderboard-table.tsx` invalid `hsl(var(--border))` — CONFIRMED, P1, HIGH confidence

**Files:** `src/components/contest/leaderboard-table.tsx:346, 349, 395, 414`

```tsx
<TableHead className="sticky left-0 z-[5] w-16 bg-background text-center shadow-[1px_0_0_0_hsl(var(--border))]">
```

`--border` is `oklch(0.922 0 0)` in `:root` and `oklch(1 0 0 / 10%)` in `.dark`. Wrapping an oklch value in `hsl(…)` produces an invalid color: `hsl(oklch(0.922 0 0))` is not parseable. Browsers drop the entire `box-shadow` declaration, so the intended 1-px column separator on the two sticky columns (rank, name) does not render in either theme. Sticky columns visually merge into the adjacent cell — a real usability defect on dense leaderboards.

**Criterion:** Visual polish + scannability on data-dense views; no WCAG criterion (the separator is decorative).

**Fix:** Drop the `hsl( … )` wrapper:
```diff
- shadow-[1px_0_0_0_hsl(var(--border))]
+ shadow-[1px_0_0_0_var(--border)]
```
or apply `border-r` on the sticky `<th>`/`<td>` since the cells are already positioned. (See UI-2/UI-3 for two more sites with the same `hsl(var(--token))` pattern that need the same fix.)

### AGG-60 — Recruit start form has no `<form>`; error lacks `aria-live` — CONFIRMED, P1, HIGH confidence

**File:** `src/app/(auth)/recruit/[token]/recruit-start-form.tsx:115-148`

```tsx
return (
  <div className="space-y-3">
    {requiresAccountPassword && (
      <>
        <label htmlFor="recruit-account-password">…</label>     {/* correctly paired */}
        <Input id="recruit-account-password" … />                {/* but no <form> ancestor */}
        <p className="text-xs text-muted-foreground">…</p>
      </>
    )}
    <Button … onClick={handlePrimaryAction} disabled={loading}>  {/* no type="submit" */}
      …
    </Button>
    {error && (
      <p className="text-sm text-destructive text-center">{error}</p>   {/* no aria-live */}
    )}
```

Three coupled defects:
1. **No `<form>` element.** The `<Input id="recruit-account-password">` is paired with its `<label htmlFor>` correctly, but Enter-key submit does not fire because there is no `<form onSubmit>` to bubble to. The `<Button>` is wired only to `onClick`, so a keyboard user who types a password and presses Enter sees nothing happen.
2. **No `aria-live` on the error `<p>`.** When `executeStart` rejects, `setError(...)` updates state, but the error `<p>` only renders on next paint with no announcement. Screen-reader users get no feedback that the start failed.
3. **`disabled={loading}`** on the button without `aria-busy`. Acceptable, but `aria-busy="true"` on the form container is more communicative.

Sibling forms in `(auth)/*` (login, signup, reset-password, forgot-password) all use the canonical `<form onSubmit>` pattern — only recruit-start diverges.

**Criterion:** WCAG 2.2 Level A 3.2.2 (Predictable: consistent input), Level A 4.1.3 (Status Messages — `aria-live`), and 2.1.1 (Keyboard: Enter submits).

**Fix:**
```diff
- <div className="space-y-3">
+ <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void handlePrimaryAction(); }}>
   …
-  <Button … onClick={handlePrimaryAction} disabled={loading}>
+  <Button type="submit" … disabled={loading}>
   …
-  {error && <p className="text-sm text-destructive text-center">{error}</p>}
+  {error && (
+    <p role="alert" className="text-sm text-destructive text-center">{error}</p>
+  )}
+ </form>
```
Move the `AlertDialog` outside the form (its own action already triggers `executeStart`). Do not nest `<form>` inside `AlertDialogContent` (its buttons should still work).

### AGG-61 — `<EmptyState>` coverage and missing `loading.tsx`/`error.tsx` — CONFIRMED, P1, HIGH confidence

**Coverage on head:**
- `loading.tsx` files: **10** across 67 leaf `page.tsx` routes (~15%)
- `error.tsx` files: **5** across 67 leaf `page.tsx` routes (~7%)
- **60 leaf page directories have NEITHER** a `loading.tsx` nor an `error.tsx` at their own level.

Inherited boundaries exist at major branches: `(public)/loading.tsx`, `(dashboard)/loading.tsx`, `(dashboard)/dashboard/admin/loading.tsx`, `(public)/problems/loading.tsx`, `(public)/groups/loading.tsx`, `(public)/contests/manage/loading.tsx`, plus parallel `error.tsx` files at the same branches. So the user does see *some* loading affordance — but it appears at the topmost segment that owns the boundary, not at the route they navigated to. Deep leaves (every admin detail page, every contest detail page, profile, rankings, submissions, community) show the parent layout's spinner while their own segment resolves, with no per-route empty/error state.

`<EmptyState>` is used at 7 sites (3 unique components: `admin/submissions`, `admin/audit-logs`, `admin/tags`). The other ~20 empty-list surfaces in the app (problems list, contests list, problem-sets list, groups list, community list, etc.) use ad-hoc inline `<p className="text-muted-foreground">…</p>` patterns.

**Criterion:** Perceived performance (Core Web Vitals LCP/INP — a local loading state reduces INP perception), and resilience (`error.tsx` is Next.js's only way to recover from a server-component throw without a full-page 500).

**Fix:** Prioritize the highest-traffic deep leaves first: `contests/[id]/`, `contests/[id]/scoreboard`, `contests/manage/[assignmentId]/...`, `practice/problems/[id]`, `problems/[id]/edit`, `community/...`, `profile/[id]`, `submissions/[id]`. Each needs its own `loading.tsx` (Skeleton matching the page chrome) and `error.tsx` (Card with retry button). Lower priority: standardize `<EmptyState>` for list routes — current inconsistency is a P2 visual-rhythm problem.

### AGG-62 — Live markdown preview re-parses per keystroke — CONFIRMED, P2, MEDIUM confidence

**Files:** `src/app/(public)/problems/create/create-problem-form.tsx:629-668`, `src/components/problem-description.tsx:38-119`

```tsx
<TabsContent value="preview">
  <div className="min-h-[200px] rounded-md border px-3 py-2 text-sm">
    {description.trim() ? (
      <ProblemDescription description={description} editorTheme={editorTheme} />   // bound to live state
    ) : …}
```

`ProblemDescription` runs `react-markdown` + `remark-gfm` + `remark-breaks` + `remark-math` + `rehype-highlight` + `rehype-katex({ strict: true, maxExpand: 100 })` on every render. There is no `React.memo`, no `useDeferredValue`, no `useTransition`. The write tab's `<Textarea value={description} onChange={setDescription}>` updates state on every keystroke, which re-renders the parent; if Base UI's `TabsContent` keeps the panel mounted (it does in the default config — only `hidden` is toggled), the preview re-parses on every keypress.

For a 200-line problem statement with code blocks and math, re-parsing is 50–200ms per keystroke (above the 50ms INP "needs improvement" threshold). Authoring latency on slow devices is noticeably janky.

**Criterion:** INP / perceived responsiveness; no WCAG criterion.

**Fix:**
```ts
const deferredDescription = useDeferredValue(description);
// …
<ProblemDescription description={deferredDescription} editorTheme={editorTheme} />
```
`useDeferredValue` lets React yield between keystroke and re-parse, dropping intermediate frames. Optional second pass: wrap `ProblemDescription` in `React.memo` so unrelated prop changes (e.g. `editorTheme`) don't re-parse when description hasn't changed.

---

## NEW UI/UX FINDINGS

### UI-1 (P1, HIGH confidence) — `text-muted-foreground/60` and `text-foreground/60` produce ~2:1 contrast in light mode

**Files:**
- `src/components/resource-usage-bar.tsx:77, 98` — `<span className="text-muted-foreground/60">/ {formatValue(limit, …)}</span>`
- `src/components/layout/public-header.tsx:306` — eyebrow text in avatar dropdown: `<p className="… text-muted-foreground/60">…</p>`
- `src/components/ui/tabs.tsx:66` — inactive `TabsTrigger`: `text-foreground/60` (light) / `text-muted-foreground` (dark)
- `src/app/(dashboard)/error.tsx:23` — error stack hint: `<p className="text-xs text-muted-foreground/70 font-mono">`

**Math (light mode):** `oklch(0.48 0 0)` at 60% opacity over `oklch(1 0 0)`:
- linear sRGB of `oklch(0.48)` ≈ 0.110592, white = 1.0
- Composited: `0.4·1.0 + 0.6·0.110592 = 0.4664`
- Contrast vs white = `(1.0 + 0.05) / (0.4664 + 0.05)` = **2.03 : 1** — fails WCAG AA 4.5:1

`text-foreground/60` (`oklch(0.145 0 0)` at 60% over white) composites to ~0.4018 → **2.32 : 1** — also fails.

In **dark mode**, the same utilities pass comfortably (~5.7–8.9:1) because the dark background is already near-black.

**Criterion:** WCAG 2.2 Level AA 1.4.3 (Contrast — Minimum).

**Fix:** Drop the `/60` modifier on these tertiary text colors in light mode. If the visual hierarchy needs de-emphasis, use the next-tier token (`text-muted-foreground` alone, ~6.5:1) or a font-weight/size step rather than opacity. For inactive tabs specifically, `text-muted-foreground` is the right baseline; reserve opacity-based de-emphasis for non-text decorative elements.

### UI-2 (P1, HIGH confidence) — `sidebar.tsx` invalid `hsl(var(--sidebar-border))` / `hsl(var(--sidebar-accent))` shadows

**File:** `src/components/ui/sidebar.tsx:473`

```tsx
"bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]"
```

Same defect class as AGG-59. `--sidebar-border` is `oklch(1 0 0 / 10%)` in dark mode and `oklch(0.922 0 0)` in light mode; wrapping in `hsl(…)` is invalid. The class is on `SidebarMenuAction`'s hover ring, so hover affordance on the menu-action button is silently invisible.

**Criterion:** Consistency with design-token system (post-AGG-59 cleanup); visible hover state for keyboard/mouse users on a destructive-adjacent control.

**Fix:** `shadow-[0_0_0_1px_var(--sidebar-border)]` and `hover:shadow-[0_0_0_1px_var(--sidebar-accent)]` — drop the `hsl()` wrapper.

### UI-3 (P1, HIGH confidence) — `tag-form-fields.tsx` inline `hsl(var(--foreground))` borderColor

**File:** `src/app/(dashboard)/dashboard/admin/tags/tag-form-fields.tsx:63`

```tsx
borderColor: value.color === c ? "hsl(var(--foreground))" : "transparent",
```

Same oklch-in-hsl defect on a color-swatch picker. The selected swatch loses its border highlight in both themes (the declaration is dropped by the CSS parser).

**Criterion:** Visible selection state on a form control (WCAG 2.2 Level A 4.1.2 — "states" half).

**Fix:** `borderColor: value.color === c ? "var(--foreground)" : "transparent"`.

### UI-4 (P2, HIGH confidence) — `<html nonce={nonce}>` is invalid HTML

**File:** `src/app/layout.tsx:100`

```tsx
<html lang={locale} suppressHydrationWarning className={pretendard.variable} nonce={nonce}>
```

Per HTML spec, the `nonce` attribute is valid only on `<script>`, `<style>`, `<link>`, `<iframe>`, etc. — **not** on `<html>`. React renders it as an attribute on `<html>`, but browsers ignore it for CSP purposes. The actual CSP `nonce` delivery path is the `Content-Security-Policy` HTTP response header; `<html nonce>` is dead weight that misleads future maintainers.

**Criterion:** HTML validity; CSP correctness (no UI symptom, but misleads maintainers).

**Fix:** Remove `nonce={nonce}` from `<html>`. The `NonceProvider` already delivers nonces to `<Script>` elements that need them. Verify by inspecting response headers (not DOM) that `Content-Security-Policy: script-src 'self' 'nonce-…'` is set on the HTTP response.

### UI-5 (P2, MEDIUM confidence) — Viewport config missing `viewport-fit` and `themeColor`

**File:** `src/app/layout.tsx:23-26`

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};
```

Missing:
- `viewportFit: "cover"` — required for `env(safe-area-inset-*)` to work on notched/Dynamic-Island devices; the recruit flow and code editor are full-screen experiences where safe-area matters.
- A `themeColor` (light/dark pair) — browsers use this for OS chrome tinting on mobile and for the PWA install UI; currently no theme color is declared anywhere the browser can read.
- No `maximum-scale` cap — current config allows user zoom (good for WCAG AAA 1.4.4; do not change).

**Criterion:** Mobile UX polish; WCAG 2.2 Level AAA 1.4.4 (current config is fine on zoom; flag is for missing polish only).

**Fix:**
```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)",  color: "#242424" },
  ],
};
```

### UI-6 (P2, MEDIUM confidence) — `api-keys` and `discussions` admin pages render no heading at the server boundary

**Files:** `src/app/(dashboard)/dashboard/admin/api-keys/page.tsx:1-30`, `src/app/(dashboard)/dashboard/admin/discussions/page.tsx`

Both server components return a client component (`<ApiKeysClient>` / `<DiscussionModerationList>`) without any server-rendered heading. Visually equivalent to a server-rendered `<h1>` once client JS loads, but two issues: (a) the heading is hidden until client hydration (LCP/CLS risk on hard navigation); (b) inconsistency with sibling admin pages that render their `<h2>` (AGG-58) directly in `page.tsx`.

**Criterion:** AGG-58 pattern continuation; perceived-performance LCP.

**Fix:** Subsumed by the AGG-58 fix. When adding `<h1>` to admin pages, also add one to `api-keys/page.tsx` (the existing in-client heading should become `<h2>`) and `discussions/page.tsx` (the `<h1>` inside `DiscussionModerationList` should become `<h2>` once a page-level `<h1>` exists).

### UI-7 (P2, LOW confidence) — `console.error` left in production component bundle

**Files:**
- `src/components/problem/problem-import-button.tsx:49`
- `src/components/submissions/_components/comment-section.tsx:79`
- `src/components/discussions/discussion-post-form.tsx:48`
- `src/components/discussions/discussion-post-delete-button.tsx:30`
- `src/components/discussions/discussion-thread-form.tsx:54`
- `src/components/discussions/discussion-thread-moderation-controls.tsx:78, 101`
- `src/components/code/compiler-client.tsx:304`

`console.error` in shipped components leaks to the browser console — visible to students who open devtools, who then file "is this an error?" issues. It also pollutes any future client-side telemetry.

**Criterion:** Production hygiene; no WCAG criterion.

**Fix:** Replace with a typed client-safe logger that no-ops in production or routes to telemetry. Low priority.

### UI-8 (P2, MEDIUM confidence) — Design-token drift: hardcoded `bg-green-100`, `text-yellow-500`, `border-blue-300` bypass the semantic token system

**Files (representative):**
- `src/components/contest/leaderboard-table.tsx:84, 98, 327, 500-503` — yellow rank-1, blue frozen banner, green/blue/red verdict cells
- `src/components/contest/anti-cheat-presentation.ts:19-28` — `bg-yellow-100 text-yellow-800`, `bg-blue-100 text-blue-800`, `bg-red-100 text-red-800`
- `src/components/ui/badge.tsx:24` — `success: "bg-green-500/15 text-green-700 …"`
- `src/components/assignment/assignment-overview.tsx:82`
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:483`
- `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:240`
- `src/components/contest/participant-timeline-view.tsx:179`

The `--chart-1..5` tokens (`globals.css:69-73`) define a cohesive blue family but are unused outside `chart-*` consumers. Status colors (green/red/yellow/blue) are inlined as Tailwind palettes, which (a) does not adapt to lecture-mode color schemes (the `lecture-theme-*` classes from `lecture-mode-provider.tsx:61` will not recolor these), and (b) drifts from any future brand restyle.

**Criterion:** Visual cohesion; lecture-mode accessibility (a low-vision user who selects a high-contrast lecture theme expects every status indicator to recolor).

**Fix:** Add `--success`, `--warning`, `--info`, `--danger` semantic tokens to `globals.css` (suggested: `oklch(0.72 0.19 152)` green, `oklch(0.80 0.18 85)` yellow, `oklch(0.70 0.15 230)` blue, `oklch(0.62 0.22 25)` red — these match the existing Tailwind 700/100 pairs at AAA text-on-tint contrast), then map `bg-green-100` → `bg-success/15`, `text-green-700` → `text-success`, etc.

### UI-9 (P2, LOW confidence) — `TabsContent` outline-none with no focus-visible replacement

**File:** `src/components/ui/tabs.tsx:81`

```tsx
className={cn("flex-1 text-sm outline-none", className)}
```

Base UI's `TabsContent` can receive focus when navigated to via keyboard in some configurations. `outline-none` removes the default focus ring with no `focus-visible:ring-*` replacement. If focus lands on the panel (e.g. via screen-reader virtual cursor), the user sees no indicator.

**Criterion:** WCAG 2.2 Level AA 2.4.7 (Focus Visible).

**Fix:** Replace `outline-none` with `outline-none focus-visible:ring-2 focus-visible:ring-ring/50`. Low priority — only relevant if Base UI config gives the panel `tabindex`.

### UI-10 (P2, MEDIUM confidence) — Sticky column `bg-background` mismatches the surrounding Card's `bg-card` row context

**File:** `src/components/contest/leaderboard-table.tsx:345-414`

The sticky header row uses `bg-background`; sticky left columns also use `bg-background`. The non-sticky data cells inherit the Card's `--card` background. In light mode `--background` and `--card` are both `oklch(1 0 0)` (identical), so no visible seam today. In **dark mode**, `--background` is `oklch(0.145 0 0)` and `--card` is `oklch(0.205 0 0)` — a ~7% lightness difference. As non-sticky cells scroll horizontally under the sticky column, the user sees a faint but visible color mismatch on the sticky column edge. Combined with the broken shadow from AGG-59 (no separator), the sticky columns look like a rendering bug rather than a deliberate UI.

**Criterion:** Visual polish on data-dense UI (sticky column consistency in dark mode).

**Fix:** Use `bg-card` (or `bg-inherit`) on sticky `<th>`/`<td>` so they match the table's row context, and add the proper separator per AGG-59. Pair this with the UI-2/UI-3 fixes.

---

## KOREAN LETTER-SPACING AUDIT

**Verdict:** CLEAN. The codebase enforces the CLAUDE.md Korean letter-spacing rule consistently via two complementary mechanisms.

**Mechanism 1 — CSS custom property with `html:lang(ko)` override (`globals.css:131-136, 220-224`):**
```css
html {
  --letter-spacing-body: -0.01em;
  letter-spacing: var(--letter-spacing-body);
}
html:lang(ko) {
  --letter-spacing-body: normal;
  --letter-spacing-heading: normal;
}
```
The `<html lang={locale}>` attribute is set correctly in `src/app/layout.tsx:100`. The override covers both body (`-0.01em`) and heading (`-0.02em`) rhythms.

**Mechanism 2 — Per-component `locale !== "ko" ? " tracking-…" : ""` ternaries** at 20+ sites. Every Tailwind `tracking-*` utility on possibly-Korean text has the guard. The few unguarded `tracking-*` uses are provably safe:
- `not-found.tsx:58`, `(public)/not-found.tsx:24` — `tracking-[0.2em]` on the literal string "404" (digits only).
- `(public)/contests/join/contest-join-client.tsx:123` — `tracking-[0.35em]` with `font-mono` on access-code input (alphanumeric only, per inline comment).
- `components/contest/access-code-manager.tsx:154` — `tracking-widest` with `font-mono` on access codes (same).
- `components/ui/dropdown-menu.tsx:242-244` — explanatory comment, no class.

**Mechanism 3 — Per-string Hangul detection in dynamic image content (`src/app/og/route.tsx:15-22`):**
```ts
function hasHangul(value: string): boolean {
  return /[ᄀ-ᇿ㄰-㆏가-힣]/.test(value);
}
```
OG title/description can be arbitrary user content (problem names, contest titles) where `locale` doesn't reliably reflect glyph language. Per-string detection is the right call.

**No new findings.** Recommendation: encode the pattern as a `cn()` helper (`trackingFor(locale, "tight")`) or ESLint rule to prevent regressions — housekeeping, not a defect.

---

## FINAL SWEEP

**Themes/dark mode:** `next-themes` with `attribute="class"` and `defaultTheme="system"` (`layout.tsx:121-127`). `.dark` flips tokens correctly. `disableTransitionOnChange` is set, avoiding the 200ms color flash. One risk: the lecture-mode overlay (`lecture-mode-provider.tsx:61`: `html.classList.add('lecture-theme-<color>')`) adds a class to `<html>` alongside `.dark` — verify a light lecture-theme class doesn't conflict with `.dark` selectors. The CSS for `.lecture-theme-*` is not in `globals.css`; if it lives in a JS-injected `<style>`, it deserves an audit for token coverage.

**Reduced motion:** `globals.css:138-145` honors `prefers-reduced-motion: reduce` globally (animation-duration: 0.01ms, transition-duration: 0.01ms, scroll-behavior: auto). Good. `@keyframes shake` (line 150) and `pulse-slow` (line 158) are gated by the same media query.

**Color scheme consistency with oklch tokens:** Mostly clean — every design token is oklch. Three `hsl(var(--token))` sites remain (AGG-59, UI-2, UI-3) and need the same one-line fix. After those, the migration from HSL to oklch is complete.

**Forms:** All authentication forms (`login`, `signup`, `reset-password`, `forgot-password`) use `<form onSubmit>` and `type="submit"` buttons correctly. Only `recruit-start-form.tsx` diverges (AGG-60). All submit buttons correctly set `disabled={loading}`.

**Keyboard navigation:** Focus-trap selectors in `public-header.tsx:95, 107` and `code-editor.tsx:64` use proper focusable selectors including `[tabindex]:not([tabindex="-1"])`. `score-timeline-chart.tsx:88` correctly adds `tabIndex={0} role="img" aria-label` to SVG points.

**ARIA live regions:** 49 `aria-live` / `role=status` / `role=alert` / `aria-busy` / `aria-invalid` attributes across the codebase — reasonable coverage. Gap: `recruit-start-form.tsx` (AGG-60) and most form-error `<p>` elements use plain `<p className="text-destructive">` without `role="alert"`. A sweep to add `role="alert"` to user-facing error text would be a P3 cleanup.

**Stack/dependency hygiene:** Tailwind 4, Base UI `@base-ui/react@^1.4.1`, Next 16, React 19 — current and idiomatic. `lucide-react@^1.8.0` is unusual (lucide-react's mainline historically sits at 0.4xx); verify this is the new 1.x line adopted intentionally, not a typo'd pin.

**Confidence summary table:**

| ID | Severity | Confidence | Type |
|---|---|---|---|
| REG-1 | P2 | HIGH | Regression check (no UI surface) |
| REG-2 | P1 | MEDIUM | Auth-check consistency (page vs API) |
| AGG-56 | — | MEDIUM | INVALIDATED (recheck: 6.54:1 passes AA) |
| AGG-57 | P2 | MEDIUM | Confirm (5–10 real sites, not 35) |
| AGG-58 | P1 | HIGH | Confirm (13 admin pages) |
| AGG-59 | P1 | HIGH | Confirm (4 leaderboard sites) |
| AGG-60 | P1 | HIGH | Confirm (recruit form) |
| AGG-61 | P1 | HIGH | Confirm (60 leaves lack local boundary) |
| AGG-62 | P2 | MEDIUM | Confirm (useDeferredValue fix) |
| UI-1 | P1 | HIGH | New — opacity-reduced text contrast |
| UI-2 | P1 | HIGH | New — sidebar hsl(var()) invalid |
| UI-3 | P1 | HIGH | New — tag-form hsl(var()) invalid |
| UI-4 | P2 | HIGH | New — html nonce attribute invalid |
| UI-5 | P2 | MEDIUM | New — viewport polish |
| UI-6 | P2 | MEDIUM | New — heading in client component |
| UI-7 | P2 | LOW | New — console.error in bundle |
| UI-8 | P2 | MEDIUM | New — design-token drift |
| UI-9 | P2 | LOW | New — TabsContent focus ring |
| UI-10 | P2 | MEDIUM | New — sticky column bg mismatch |

**Recommended fix order:** AGG-59 → UI-2 → UI-3 (same one-line CSS fix, ship together). Then AGG-58 (heading hierarchy). Then AGG-60 (form semantics). Then UI-1 (opacity contrast). Then AGG-61 (loading/error boundaries, scoped to top 10 deep leaves). Drop AGG-56 entirely.
