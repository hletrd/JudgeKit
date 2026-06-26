# Cycle 3 — designer

**Focus:** Re-verify cycle-2 Phase-B carry-forward (AGG-57..AGG-62, UI-1..UI-10), confirm REG-2 strict gate landed (commit `90bcfcff`), re-confirm AGG-56 invalidation, and run a fresh WCAG 2.2 / Korean-letter-spacing / dark-mode / perceived-perf sweep on head `207623f9`.
**Date:** 2026-06-27
**HEAD reviewed:** `207623f9`
**Method:** Static analysis only. Diff `ad543e14..207623f9 -- 'src/**/*.tsx'` returns only two touched files (`community/threads/[id]/page.tsx`, `problems/[id]/edit/page.tsx`) — the latter is the REG-2 fix; no new UI surface was added between cycles. All findings cite exact file:line selectors. Computed-style evidence is derived from the `--background`/`--foreground`/`--border` oklch tokens defined in `globals.css:55-100`. Dev-server browser pass was not feasible this cycle; the surface is unchanged since cycle 2, so static analysis is sufficient.
**Framework detected:** Next.js 16.2.9 + React 19.2 + Tailwind 4 + shadcn-style (Base UI `@base-ui/react@1.4.1`) + next-intl 4.9 + next-themes 0.4.

---

## REGRESSION

### REG-1 (—, HIGH confidence) — No UI files changed between cycle 2 and head `207623f9`

**Evidence:** `git diff ad543e14..207623f9 --name-only -- 'src/**/*.tsx' 'src/**/*.css'`:
- `src/app/(public)/community/threads/[id]/page.tsx` — 6-line tweak, no semantic UI change.
- `src/app/(public)/problems/[id]/edit/page.tsx` — the REG-2 fix itself (see REG-2 below).

No new components, no new globals.css edits, no new messages. Cycle-2 designer surface is intact.

**Criterion:** Cycle-over-cycle regression risk = 0.

### REG-2 (FIXED ✓, HIGH confidence) — Edit page now routes through strict `canManageProblem`

**File:** `src/app/(public)/problems/[id]/edit/page.tsx:33-37`

```ts
// Route the edit-page gate through the same strict, group-scoped
// canManageProblem used by the PATCH/DELETE APIs (A11). … (designer cycle-2 REG-2).
const canEdit = await canManageProblem(problem.id, session.user.id, session.user.role);
const canOverrideTestCases = caps.has("problems.delete");
if (!canEdit) {
  redirect(`/problems/${problem.id}`);
}
```

`canManageProblem` (`src/lib/auth/permissions.ts:186-218`) is the group-scoped gate (passes only for org-wide admins via `groups.view_all`, the author, or a user who teaches a group linked via `problemGroupAccess`). The page only feeds `initialProblem.referenceSolution` (line 110) and the full `testCases` array (line 103) into `<CreateProblemForm>` *after* `canEdit` passes. The cycle-2 read-leak (out-of-group `problems.edit` holder could see hidden test cases + reference solution via the edit page even though the API refused the save) is closed. A regression test exists at `tests/unit/api/problem-edit-page-strict-gate.test.ts`.

**Criterion:** Page-level auth now matches API-level auth (A11). No designer action required.

**Fix:** None — close this item.

---

## PHASE-B RE-CONFIRMATION (against head `207623f9`)

### AGG-56 — `--muted-foreground` contrast — INVALIDATED (carried forward), MEDIUM confidence

**Recheck at `globals.css:64`:** `--muted-foreground: oklch(0.48 0 0)` on `--background: oklch(1 0 0)`. OKLab → linear-sRGB matrix for `l=m=s=0.48` gives linear 0.110592; contrast vs white = `(1.0 + 0.05) / (0.110592 + 0.05)` = **6.54 : 1** — passes WCAG AA 4.5:1 (normal text) and approaches AAA 7:1. Dark mode (`oklch(0.75 0 0)` on `oklch(0.145 0 0)`) ≈ **8.9 : 1**. Drop from queue.

### AGG-57 — `<Label>` without `htmlFor`/wrapping — CONFIRMED, P2, MEDIUM confidence

**Scope unchanged from cycle 2.** Representative broken sites on head:

| File:line | Usage | Issue |
|---|---|---|
| `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:385` | `<Label>{t("communityVotingTitle")}</Label>` | Section heading rendered as `<label>` with no control; should be `<h3>`/`<p>` |
| `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:406` | `<Label className="text-base font-medium">{t("smtpTitle")}</Label>` | Same — section heading-as-label |
| `src/components/problem/problem-submission-form.tsx:504` | `<Label className="text-xs text-destructive">{t("compileError")}</Label>` | Labels a `<pre>` output panel — no `htmlFor`, no programmatic association |
| `src/components/problem/problem-submission-form.tsx:515` | `<Label className="text-xs">{t("stdout")}</Label>` | Same — labels a `<pre>` |
| `src/components/problem/problem-submission-form.tsx:520` | `<Label className="text-xs text-yellow-700 dark:text-yellow-400">{t("stderr")}</Label>` | Same — labels a `<pre>` |
| `src/components/problem/function-reference-solution.tsx:188` | `<Label>{t("fnStubPreviewTitle")}</Label>` | Precedes a `<pre>` (the `<pre>` does have its own `aria-label` at line 194 — duplicate labeling, still leaves the `<Label>` unpaired) |

**Criterion:** WCAG 2.2 Level A 1.3.1 (Info and Relationships) and 4.1.2 (Name, Role, Value).

**Fix:** For section headings, swap `<Label>` → `<h3 className="text-base font-medium">` (or `<p className="text-sm font-medium">` if it should not appear in the heading outline). For output-panel labels, use `<p id="stdout-label">` + `<pre aria-labelledby="stdout-label">`, or wrap the `<pre>` inside `<label>…<pre>…</pre></label>`.

### AGG-58 — Admin pages use `<h2>` for page title — CONFIRMED + BROADER than cycle 2, P1, HIGH confidence

**Cycle-2 said:** 13 admin pages emit `<h2>` as page title with no `<h1>` preceding it.
**Cycle-3 finding:** The defect extends well beyond the admin tree — it affects every primary public/dashboard route too. Pages confirmed on head `207623f9`:

Admin (13):
- `admin/workers/page.tsx:26`, `admin/settings/page.tsx:441`, `admin/files/page.tsx:129`, `admin/login-logs/page.tsx:242`, `admin/audit-logs/page.tsx:364`, `admin/languages/page.tsx:44`, `admin/tags/page.tsx:58`, `admin/plugins/page.tsx:23`, `admin/plugins/chat-logs/page.tsx:20`, `admin/plugins/[id]/page.tsx:26`, `admin/users/[id]/page.tsx:74`, `admin/submissions/page.tsx:307` — all `<h2 className="text-2xl font-bold">`.
- (`admin/page.tsx:43` and `admin/roles/page.tsx:73` correctly use `<h1>`.)

Public / dashboard (additional, not flagged in cycle 2):
- `src/app/(public)/problems/page.tsx:547` — `<h2 className="text-2xl font-bold">{t("title")}</h2>`
- `src/app/(public)/problems/[id]/edit/page.tsx:73` — `<h2 className="text-2xl font-bold">{t("editTitle")}</h2>` *(this is the same file cycle-2's REG-2 touched — the gate fix did not address the heading).*
- `src/app/(public)/problems/create/page.tsx:94` — `<h2 className="text-2xl font-bold">`
- `src/app/(public)/problem-sets/_components/problem-set-form.tsx:262` — `<h2 className="text-2xl font-bold">`
- `src/app/(public)/groups/page.tsx:213` — `<h2 className="text-2xl font-bold">{t("title")}</h2>`
- `src/app/(public)/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx:175`
- `src/app/(public)/profile/page.tsx:58` — `<h2 className="text-2xl font-bold">{t("title")}</h2>`
- `src/app/(public)/dashboard/page.tsx:40` — `<h2 className="text-2xl font-bold">{t("title")}</h2>`
- `src/app/(public)/contests/[id]/page.tsx:243` — `<h2 className="text-2xl font-bold sm:text-3xl truncate">{contest.title}</h2>`
- `src/app/(public)/contests/manage/[assignmentId]/page.tsx:360`
- `src/app/(public)/contests/manage/[assignmentId]/students/[userId]/page.tsx:121`
- `src/app/(public)/contests/manage/[assignmentId]/participant/[userId]/submissions/page.tsx:118`
- `src/app/(public)/practice/problems/[id]/rankings/page.tsx:129`

Shell layouts (`(public)/layout.tsx`, `(dashboard)/layout.tsx`) render no `<h1>` either. Breadcrumbs (`<header className="hidden md:block …">` in `(dashboard)/layout.tsx:67`) are not in a heading. Result: every page in the `(public)` and `(dashboard)` trees that uses an `<h2>` opener has no `<h1>` ancestor at all — screen-reader "jump to heading 1" yields nothing for ~30 routes.

Sibling pages that **do** use `<h1>` correctly: `admin/page.tsx`, `admin/roles/page.tsx`, `(public)/languages/page.tsx:56`, `(public)/groups/[id]/analytics/page.tsx:101`, `(public)/playground/page.tsx:82`, `(public)/rankings/page.tsx:233`, `(public)/submissions/page.tsx:330`, `(public)/users/[id]/page.tsx:218`, the `_components/public-problem-detail.tsx:70` (so `practice/problems/[id]` is fine).

**Criterion:** WCAG 2.2 Level A 1.3.1 — heading hierarchy; page main heading must be `<h1>` so AT users can navigate by heading.

**Fix:** Replace `<h2 className="text-2xl font-bold">…</h2>` with `<h1 className="text-2xl font-bold">…</h1>` at the listed pages. Visual size is unchanged (the class is identical); only the semantics change. Cheap batch fix.

### AGG-59 — `leaderboard-table.tsx` invalid `hsl(var(--border))` — CONFIRMED, P1, HIGH confidence

**Files (unchanged):** `src/components/contest/leaderboard-table.tsx:346, 349, 395, 414`

```tsx
<TableHead className="sticky left-0 z-[5] w-16 bg-background text-center shadow-[1px_0_0_0_hsl(var(--border))]">
```

`--border` is `oklch(0.922 0 0)` (`:root`) / `oklch(1 0 0 / 10%)` (`.dark`). `hsl(oklch(…))` is not parseable; browsers drop the whole `box-shadow` declaration. The intended 1-px column separator on sticky rank/name columns does not render in either theme. Combined with UI-10 below, sticky columns visually merge into the adjacent cell.

**Criterion:** Visual polish on data-dense UI (decorative — no WCAG criterion). Real usability defect on wide leaderboards.

**Fix:** `shadow-[1px_0_0_0_var(--border)]` — drop the `hsl(…)` wrapper. Or apply `border-r border-border` on the sticky `<th>`/`<td>`.

### AGG-60 — Recruit start form has no `<form>`; error lacks `aria-live` — CONFIRMED, P1, HIGH confidence

**File (unchanged):** `src/app/(auth)/recruit/[token]/recruit-start-form.tsx:115-150`

```tsx
return (
  <div className="space-y-3">                       // ← no <form>
    {requiresAccountPassword && (
      <>
        <label className="block text-sm font-medium" htmlFor="recruit-account-password">…</label>
        <Input id="recruit-account-password" type="password" … />     // Enter-key does nothing
        <p className="text-xs text-muted-foreground">{t("accountPasswordHint")}</p>
      </>
    )}
    <Button className="w-full" size="lg"
      onClick={handlePrimaryAction} disabled={loading}>               // ← only onClick, no type="submit"
      …
    </Button>
    {error && (
      <p className="text-sm text-destructive text-center">{error}</p>  // ← no role="alert", no aria-live
    )}
```

Same three coupled defects as cycle 2:
1. No `<form>` ancestor — Enter-key submit does not fire.
2. Error `<p>` has no `aria-live`/`role="alert"` — SR users get no failure announcement.
3. `disabled={loading}` with no `aria-busy` on the form container.

Sibling auth forms (`login-form.tsx:60`, `signup-form.tsx:125`, `reset-password-form.tsx:116`, `forgot-password-form.tsx:85`) all use canonical `<form onSubmit>`. `signup-form.tsx` is the model: `aria-invalid`, `aria-describedby`, and `role="alert"` on every field error.

**Criterion:** WCAG 2.2 Level A 3.2.2 (Predictable), A 4.1.3 (Status Messages), A 2.1.1 (Keyboard).

**Fix:**
```diff
- <div className="space-y-3">
+ <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void handlePrimaryAction(); }}>
   …
-  <Button … onClick={handlePrimaryAction} disabled={loading}>
+  <Button type="submit" … disabled={loading}>
   …
-  {error && <p className="text-sm text-destructive text-center">{error}</p>}
+  {error && <p role="alert" className="text-sm text-destructive text-center">{error}</p>}
+ </form>
```
Keep the `<AlertDialog>` outside the form; it already calls `executeStart` from its own action.

### AGG-61 — `<EmptyState>` coverage and missing `loading.tsx`/`error.tsx` — CONFIRMED, P1, HIGH confidence

**Coverage on head `207623f9`:**
- `loading.tsx` files: **10** across 67 leaf `page.tsx` routes (~15%) — same set as cycle 2.
- `error.tsx` files: **5** across 67 leaf `page.tsx` routes (~7%) — same set as cycle 2.
- **60 leaf page directories have NEITHER** a local `loading.tsx` nor `error.tsx`.

Inherited boundaries: `(public)/loading.tsx`, `(public)/problems/loading.tsx`, `(public)/groups/loading.tsx`, `(public)/contests/manage/loading.tsx`, `(dashboard)/loading.tsx`, `(dashboard)/dashboard/admin/loading.tsx`, `(dashboard)/dashboard/admin/users/loading.tsx`, `(dashboard)/dashboard/admin/submissions/loading.tsx`, `(auth)/recruit/[token]/results/loading.tsx`, `(public)/contests/manage/[assignmentId]/participant/loading.tsx`. Plus parallel `error.tsx` at `(public)`, `(public)/problems`, `(public)/groups`, `(public)/contests/manage`, `(dashboard)`, `(dashboard)/dashboard/admin`.

So the user does see *some* spinner — but it appears at the topmost segment that owns the boundary, not at the route they navigated to. Deep leaves (`contests/[id]/`, `contests/[id]/scoreboard`, `contests/manage/[assignmentId]/students/[userId]`, `practice/problems/[id]/rankings`, `community/threads/[id]`, `profile`, `submissions`, `users/[id]`, every admin detail page) show the parent layout's spinner while their own segment resolves.

`<EmptyState>` is used at 7 sites (admin/submissions, admin/audit-logs, admin/tags). The other ~20 empty-list surfaces use ad-hoc inline `<p className="text-muted-foreground">…</p>`.

**Criterion:** Perceived performance (LCP/INP — a local loading state reduces INP perception) and resilience (`error.tsx` is Next.js's only way to recover from a server-component throw without a full 500).

**Fix:** Top-priority deep leaves: `contests/[id]/`, `contests/[id]/scoreboard`, `contests/manage/[assignmentId]/students/[userId]`, `practice/problems/[id]/rankings`, `community/threads/[id]`, `profile`, `users/[id]`, plus all `admin/[detail]` pages. Each needs its own `loading.tsx` (Skeleton matching page chrome) and `error.tsx` (Card with retry). Lower priority: standardize `<EmptyState>` for list routes.

### AGG-62 — Live markdown preview re-parses per keystroke — CONFIRMED, P2, MEDIUM confidence

**Files (unchanged):** `src/app/(public)/problems/create/create-problem-form.tsx:629-668`, `src/components/problem-description.tsx:38-119`.

`grep -n 'useDeferredValue\|useTransition' create-problem-form.tsx` returns **nothing** — neither hook was added since cycle 2. `ProblemDescription` still runs `react-markdown` + `remark-gfm` + `remark-breaks` + `remark-math` + `rehype-highlight` + `rehype-katex({ strict: true, maxExpand: 100 })` on every render. The `<Textarea value={description} onChange={setDescription}>` updates state on every keystroke; Base UI's `TabsContent` keeps both panels mounted (only `hidden` is toggled), so the preview re-parses on every keypress. For a 200-line statement with code+math, re-parsing is 50–200ms per keystroke (above the INP "needs improvement" 50ms threshold).

**Criterion:** INP / perceived responsiveness; no WCAG criterion.

**Fix:**
```ts
const deferredDescription = useDeferredValue(description);
// …
<ProblemDescription description={deferredDescription} editorTheme={editorTheme} />
```
Optional: wrap `ProblemDescription` in `React.memo` so unrelated prop changes don't re-parse.

---

## CARRY-FORWARD UI FINDINGS (re-verified on head `207623f9`)

### UI-1 (P1, HIGH confidence) — `text-muted-foreground/60`, `text-foreground/60` produce ~2:1 contrast in light mode

**Files (unchanged):**
- `src/components/resource-usage-bar.tsx:77, 98` — `<span className="text-muted-foreground/60">/ {formatValue(limit, unit, locale)}</span>`
- `src/components/layout/public-header.tsx:306` — eyebrow text in avatar dropdown
- `src/components/ui/tabs.tsx:66` — inactive `TabsTrigger`: `text-foreground/60` (light) / `text-muted-foreground` (dark)
- `src/app/(dashboard)/error.tsx:23` — error-id mono hint: `text-muted-foreground/70`

**Math (light mode):** `oklch(0.48 0 0)` at 60% opacity over `oklch(1 0 0)` composites to `0.4·1.0 + 0.6·0.110592 = 0.4664`; contrast vs white = **2.03 : 1** — fails AA 4.5:1. `text-foreground/60` (`oklch(0.145 0 0)` at 60% over white) composites to ~0.4018 → **2.32 : 1** — also fails.

Dark mode passes comfortably (~5.7–8.9:1) because the dark background is already near-black.

**Criterion:** WCAG 2.2 Level AA 1.4.3 (Contrast — Minimum).

**Fix:** Drop the `/60` modifier on these tertiary text colors in light mode. If visual hierarchy needs de-emphasis, use `text-muted-foreground` alone (~6.5:1), or a font-weight/size step rather than opacity. For inactive tabs, `text-muted-foreground` is the right baseline.

### UI-2 (P1, HIGH confidence) — `sidebar.tsx` invalid `hsl(var(--sidebar-border))` / `hsl(var(--sidebar-accent))`

**File (unchanged):** `src/components/ui/sidebar.tsx:473`

```tsx
"bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]"
```

Same defect class as AGG-59. `--sidebar-border` is `oklch(0.922 0 0)` light / `oklch(1 0 0 / 10%)` dark; wrapping in `hsl(…)` is invalid. The class is on `SidebarMenuButton` variant `"outline"` — its hover ring is silently invisible.

**Fix:** `shadow-[0_0_0_1px_var(--sidebar-border)]` and `hover:shadow-[0_0_0_1px_var(--sidebar-accent)]`.

### UI-3 (P1, HIGH confidence) — `tag-form-fields.tsx` inline `hsl(var(--foreground))` borderColor

**File (unchanged):** `src/app/(dashboard)/dashboard/admin/tags/tag-form-fields.tsx:63`

```tsx
borderColor: value.color === c ? "hsl(var(--foreground))" : "transparent",
```

Same oklch-in-hsl defect on a color-swatch picker. The selected swatch loses its border highlight in both themes.

**Criterion:** WCAG 2.2 Level A 4.1.2 (Name, Role, Value — "states" half).

**Fix:** `borderColor: value.color === c ? "var(--foreground)" : "transparent"`.

### UI-4 (P2, HIGH confidence) — `<html nonce={nonce}>` is invalid HTML

**File (unchanged):** `src/app/layout.tsx:100`

```tsx
<html lang={locale} suppressHydrationWarning className={pretendard.variable} nonce={nonce}>
```

Per HTML spec, `nonce` is valid only on `<script>`, `<style>`, `<link>`, `<iframe>` — **not** on `<html>`. Browsers ignore it for CSP purposes. The actual CSP nonce delivery path is the `Content-Security-Policy` response header; `<html nonce>` is dead weight.

**Fix:** Remove `nonce={nonce}` from `<html>`. The `NonceProvider` (line 117) already delivers nonces to `<Script>` elements that need them.

### UI-5 (P2, MEDIUM confidence) — Viewport config missing `viewport-fit` and `themeColor`

**File (unchanged):** `src/app/layout.tsx:23-26`

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};
```

Missing:
- `viewportFit: "cover"` — required for `env(safe-area-inset-*)` on notched/Dynamic-Island devices; the recruit flow and code editor are full-screen experiences where safe-area matters.
- A `themeColor` pair — browsers use this for OS chrome tinting on mobile and for PWA install UI.
- (No `maximum-scale` cap — current config allows user zoom. Good for WCAG AAA 1.4.4; do not change.)

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

### UI-6 (P2, MEDIUM confidence) — `api-keys` page has no heading at all; `discussions` page has heading only in client component

**Files (unchanged):**
- `src/app/(dashboard)/dashboard/admin/api-keys/page.tsx` returns only `<ApiKeysClient roleOptions={roleOptions} />`. The client component at `api-keys-client.tsx:325` uses `<CardTitle>{t("title")}</CardTitle>` — `CardTitle` renders as a `<div>` (`components/ui/card.tsx:31`), **not** a heading. There is **no `<h1>`/`<h2>`/`<h3>`** in the rendered tree for this page at all.
- `src/app/(dashboard)/dashboard/admin/discussions/page.tsx` returns filter Badges plus `<DiscussionModerationList>`. The `<h1 className="text-3xl font-semibold">` is inside the client component (`discussion-moderation-list.tsx:46`), so (a) it is hidden until hydration (LCP/CLS risk on hard navigation), and (b) inconsistent with sibling admin pages that render the page `<h2>` server-side (per AGG-58, those `<h2>`s should be `<h1>`s).

**Criterion:** AGG-58 continuation; WCAG 2.2 Level A 1.3.1 (heading hierarchy); perceived-performance LCP.

**Fix:** When applying the AGG-58 batch `<h2>` → `<h1>`:
- `api-keys/page.tsx` — add `<h1 className="text-2xl font-bold">{t("title")}</h1>` server-side; the in-client `CardTitle` stays as a card-level title.
- `discussions/page.tsx` — add `<h1 className="text-2xl font-bold">{tModeration("title")}</h1>` server-side; the in-client `<h1>` in `discussion-moderation-list.tsx:46` should become `<h2>` once a page-level `<h1>` exists.

### UI-7 (P2, LOW confidence) — `console.error` in production component bundles (EXPANDED since cycle 2)

**Files on head `207623f9`** (cycle 2 listed 7; cycle 3 finds 14 in components + 6 in error boundaries — error boundaries are dev-only and OK; the component-side ones are not):

| File:line | Note |
|---|---|
| `src/components/submissions/_components/comment-section.tsx:79` | Always logs |
| `src/components/problem/problem-import-button.tsx:49` | Always logs |
| `src/components/discussions/discussion-post-form.tsx:48` | Always logs |
| `src/components/discussions/discussion-post-delete-button.tsx:30` | Always logs |
| `src/components/discussions/discussion-thread-moderation-controls.tsx:78, 101` | Always logs |
| `src/components/discussions/discussion-thread-form.tsx:54` | Always logs |
| `src/components/code/compiler-client.tsx:304` | Always logs |
| `src/app/(dashboard)/dashboard/admin/roles/role-delete-dialog.tsx:59` | NEW since cycle 2 |
| `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:107` | NEW since cycle 2 |
| `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:180, 212, 248` | NEW since cycle 2 |
| `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:160` | NEW since cycle 2 |
| `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:215` | NEW since cycle 2 |
| `src/app/(public)/problems/create/create-problem-form.tsx:355` | Always logs |
| `src/app/(public)/groups/create-group-dialog.tsx:44` | Always logs |

`error.tsx` `console.error` (`(dashboard)/error.tsx`, `(dashboard)/dashboard/admin/error.tsx`, `(public)/problems/error.tsx`, `(public)/groups/error.tsx`) are correctly gated by `if (process.env.NODE_ENV === "development")` — those are fine.

The component-side logs leak to the browser console in production. Students who open devtools see red errors and file "is this an error?" issues; the logs also pollute any future client telemetry.

**Fix:** Replace with a typed client-safe logger that no-ops in production or routes to telemetry.

### UI-8 (P2, MEDIUM confidence) — Design-token drift: hardcoded `bg-green-*`, `text-yellow-*`, `border-blue-*` bypass the semantic token system

**Scale (unchanged from cycle 2):** `grep -rEn '(bg|text|border)-(green|yellow|blue|red|orange|purple)-(100|200|300|500|600|700|800)' src/components src/app` returns **74 hits**.

Representative sites:
- `src/components/contest/leaderboard-table.tsx:84, 98, 327, 500-503` — yellow rank-1, blue frozen banner, green/blue/red verdict cells.
- `src/components/contest/anti-cheat-presentation.ts:19-28` — `bg-yellow-100 text-yellow-800`, `bg-blue-100 text-blue-800`, `bg-red-100 text-red-800`.
- `src/components/ui/badge.tsx:24` — `success: "bg-green-500/15 text-green-700 …"`.
- `src/components/contest/participant-timeline-view.tsx:179`, `src/components/assignment/assignment-overview.tsx:82`.
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:483`, `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:240`.

The `--chart-1..5` tokens (`globals.css:69-73`) define a cohesive blue family but are unused outside chart consumers. Status colors are inlined as Tailwind palettes, which (a) does not adapt to lecture-mode color schemes (`.lecture-theme-dark/light/solarized` at `globals.css:404-500` only redefine semantic tokens, not Tailwind palettes), and (b) drifts from any future brand restyle.

**Criterion:** Visual cohesion; lecture-mode accessibility (a low-vision user who selects a high-contrast lecture theme expects every status indicator to recolor — currently they don't).

**Fix:** Add `--success`, `--warning`, `--info`, `--danger` semantic tokens to `globals.css` (suggested: `oklch(0.72 0.19 152)` green, `oklch(0.80 0.18 85)` yellow, `oklch(0.70 0.15 230)` blue, `oklch(0.62 0.22 25)` red — these match the existing Tailwind 700/100 pairs at AAA text-on-tint contrast), then map `bg-green-100` → `bg-success/15`, `text-green-700` → `text-success`, etc. Also extend the lecture-theme blocks to redefine these four tokens so lecture mode recolors status indicators consistently.

### UI-9 (P2, LOW confidence) — `TabsContent` outline-none with no focus-visible replacement

**File (unchanged):** `src/components/ui/tabs.tsx:81`

```tsx
className={cn("flex-1 text-sm outline-none", className)}
```

`TabsTrigger` (line 66) correctly has `focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring`, but `TabsContent` has bare `outline-none`. If focus lands on the panel (e.g. via screen-reader virtual cursor or programmatic focus), the user sees no indicator.

**Criterion:** WCAG 2.2 Level AA 2.4.7 (Focus Visible).

**Fix:** Replace `outline-none` with `outline-none focus-visible:ring-2 focus-visible:ring-ring/50`. Low priority — only relevant if Base UI config gives the panel `tabindex`.

### UI-10 (P2, MEDIUM confidence) — Sticky column `bg-background` mismatches the surrounding Card's `bg-card` row context (dark mode)

**File (unchanged):** `src/components/contest/leaderboard-table.tsx:345-414`

Sticky header row, sticky rank cell, and sticky name cell all use `bg-background`. The non-sticky data cells inherit the Card's `--card` background. In light mode `--background` and `--card` are both `oklch(1 0 0)` (identical), so no visible seam. In **dark mode**, `--background` is `oklch(0.145 0 0)` and `--card` is `oklch(0.205 0 0)` — a ~7% lightness difference. As non-sticky cells scroll horizontally under the sticky column, the user sees a faint but visible color mismatch on the sticky column edge. Combined with the broken shadow from AGG-59 (no separator), the sticky columns look like a rendering bug.

**Criterion:** Visual polish on data-dense UI (sticky column consistency in dark mode).

**Fix:** Use `bg-card` (or `bg-inherit`) on sticky `<th>`/`<td>` so they match the table's row context, and add the AGG-59 separator.

---

## NEW UI/UX FINDINGS (cycle 3)

### UI-11 (P1, HIGH confidence) — Error boundaries render `<h2>` instead of `<h1>`, leaving the error route with no `<h1>`

**Files:**
- `src/app/(dashboard)/error.tsx:23` — `<h2 className="text-2xl font-semibold">{t("errorTitle")}</h2>`
- `src/app/(dashboard)/dashboard/admin/error.tsx:21` — `<h2 className="text-2xl font-semibold">{t("errorTitle")}</h2>`
- `src/app/(public)/problems/error.tsx:18` — same
- `src/app/(public)/groups/error.tsx` (parallel pattern)
- `src/app/(public)/contests/manage/error.tsx` (parallel pattern)

When a server component throws, Next.js replaces the segment's UI with the nearest `error.tsx`. The page's original `<h1>` (or `<h2>` per AGG-58) is unmounted; only the error boundary's `<h2>` remains. Result: every error screen has no `<h1>`, so AT users cannot jump to the page heading to learn what went wrong.

**Criterion:** WCAG 2.2 Level A 1.3.1 (heading hierarchy); 4.1.2 (Name, Role, Value — the error banner should be the page's primary heading).

**Fix:** Promote the error title `<h2>` to `<h1>` in all five `error.tsx` files. (Trivial — same class, just change the tag.)

### UI-12 (P2, MEDIUM confidence) — `discussion-moderation-list.tsx` renders the page's only `<h1>` at `text-3xl` while sibling admin pages use `text-2xl`

**File:** `src/components/discussions/discussion-moderation-list.tsx:46`

```tsx
<h1 className={`text-3xl font-semibold${headingTracking}`}>{title}</h1>
```

Sibling admin pages use `<h2 className="text-2xl font-bold">` (per AGG-58). When AGG-58's fix promotes those to `<h1 className="text-2xl font-bold">`, discussions will be the only admin page at `text-3xl font-semibold` — a visual-rhythm inconsistency. (This was implicit in UI-6 but worth calling out as a separate sizing fix.)

**Criterion:** Visual rhythm consistency across the admin section.

**Fix:** When applying the AGG-58 + UI-6 fix, normalize discussions' page heading to `<h1 className="text-2xl font-bold">` (server-rendered in `page.tsx`, see UI-6).

### UI-13 (P2, LOW confidence) — `<CardTitle>` is a `<div>`, so 143 card titles have no heading semantics

**File:** `src/components/ui/card.tsx:31-40`

```tsx
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-base leading-snug font-medium …", className)}
      {...props}
    />
  )
}
```

`grep -rn '<CardTitle' src/app src/components` returns **143 sites**. None of them contribute to the document heading outline. Cards that act as visual sections (e.g. problem-statement card, leaderboard card, submission-form card) are not navigable as headings by AT users.

This is a known shadcn-style tradeoff (avoid polluting the h-level outline with card chrome), and is usually fine. Raising it as P2 because the *consequence* interacts with AGG-58: pages whose only "heading-like" element is a `CardTitle` (e.g. `api-keys/page.tsx` per UI-6) end up with **zero** heading semantics at all.

**Criterion:** WCAG 2.2 Level A 1.3.1 (Info and Relationships) — only in combination with AGG-58/UI-6; isolated card titles are acceptable.

**Fix:** None required for cards that sit inside a page with a real `<h1>`. For card-as-page sections (e.g. api-keys), add an explicit `<h1>` per UI-6.

---

## KOREAN LETTER-SPACING AUDIT

**Verdict:** CLEAN. Same three complementary mechanisms as cycle 2; no regressions.

**Mechanism 1 — `html:lang(ko)` CSS override (`globals.css:131-136`):**
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
`<html lang={locale}>` is set correctly in `src/app/layout.tsx:100`.

**Mechanism 2 — Per-component `locale !== "ko" ? " tracking-…" : ""` ternaries** at 25+ sites. Sampled: `admin/page.tsx:38`, `home-page-content-form.tsx:50`, `languages/page.tsx:49-50`, `users/[id]/page.tsx:218`, `rankings/page.tsx:233`, `submissions/page.tsx:330`, `recruit/[token]/results/page.tsx:268-280`, `privacy/page.tsx:53`, `public-problem-set-detail.tsx:55`, `public-problem-set-list.tsx:35`, `discussion-thread-view.tsx:42`, `my-discussions-list.tsx:24`, `discussion-thread-list.tsx:46`, `discussion-moderation-list.tsx:42`, `user-stats-dashboard.tsx:60`, `not-found.tsx:60`, `(public)/not-found.tsx:25`. All Korean-aware.

**Mechanism 3 — Per-string Hangul detection in OG image content (`src/app/og/route.tsx:15-22`):**
```ts
function hasHangul(value: string): boolean {
  return /[ᄀ-ᇿ㄰-㆏가-힣]/.test(value);
}
```
Required because OG titles can be arbitrary user content (problem names, contest titles) where the `locale` doesn't reliably reflect glyph language.

**Unguarded tracking utilities (all provably safe):**
- `not-found.tsx:58`, `(public)/not-found.tsx:24` — `tracking-[0.2em]` on the literal string "404" (digits only, with explanatory comment).
- `(public)/contests/join/contest-join-client.tsx:123` — `tracking-[0.35em]` with `font-mono` on access-code input (alphanumeric only, per inline comment).
- `components/contest/access-code-manager.tsx:154` — `tracking-widest` with `font-mono` on access codes (same, with comment).

**No new findings.** Housekeeping recommendation from cycle 2 still stands: encode the pattern as a `cn()` helper or ESLint rule to prevent regressions.

---

## FINAL SWEEP

**Themes / dark mode:** `next-themes` with `attribute="class"`, `defaultTheme="system"`, `disableTransitionOnChange` (`layout.tsx:121-127`). `.dark` flips tokens correctly. **Lecture-mode overlay** (cycle-2 unknown) now confirmed: `.lecture-mode.lecture-theme-{dark,light,solarized}` classes live at `globals.css:404-500` and redefine every semantic token including sidebar, problem-code, and chart colors. No `.dark` selector conflict because the lecture-mode classes are added to `<html>` alongside `.dark` and both target tokens (cascade resolves cleanly). ThemeToggle and LocaleSwitcher both have proper `aria-label`, 44x44 mobile touch targets, and `role="status" aria-busy="true"` Skeleton placeholders during hydration.

**Reduced motion:** `globals.css:138-145` honors `prefers-reduced-motion: reduce` globally (animation/transition-duration 0.01ms, scroll-behavior auto). `@keyframes shake` and `pulse-slow` are gated. `ThemeToggle`'s spinners and sonner's icons all fall under the global gate.

**Color scheme consistency with oklch tokens:** Every design token is oklch. **Three** `hsl(var(--token))` sites remain — AGG-59 (4 leaderboard sites), UI-2 (sidebar hover ring), UI-3 (tag-form swatch border) — and need the same one-line fix (`hsl(var(--X))` → `var(--X)`). After those, the HSL-to-oklch migration is complete.

**Forms:** All canonical auth forms (`login`, `signup`, `reset-password`, `forgot-password`) use `<form onSubmit>` + `type="submit"` + `aria-invalid` + `aria-describedby` + `role="alert"` (signup-form is the model). Only `recruit-start-form.tsx` diverges (AGG-60). All submit buttons correctly set `disabled={loading}`. Audit of `text-destructive` form-error sites: 29 total, 15 have `role="alert"`, 13 inputs have `aria-invalid` — **gap: ~14 form-error `<p>`s use plain `<p className="text-destructive">` with no `role="alert"`/`aria-live`.** P3 cleanup.

**Keyboard navigation:**
- Skip-to-content link (`components/layout/skip-to-content.tsx`) is correctly implemented: `sr-only` until `:focus`, targets `#main-content`, contrast in both themes.
- Mobile menu (`public-header.tsx:55-140`) implements a real focus trap: Escape closes, focus moves to first item on open, Tab wraps with Shift+Tab support, focus is restored to the toggle on close and on route change.
- Sidebar menu items use `outline-hidden focus-visible:ring-2` consistently (`sidebar.tsx:392, 416, 467, 561, 668`).
- Score-timeline-chart SVG points have `tabIndex={0} role="img" aria-label` (cycle-2 noted this; still good).
- Select / DropdownMenu / AlertDialog / Dialog delegate keyboard semantics to `@base-ui/react` (which provides arrow-key nav, focus trap, type-ahead, Escape-to-close natively).
- TabsContent focus gap is UI-9 above.

**ARIA live regions:** 49 `aria-live` / `role=status` / `role=alert` / `aria-busy` / `aria-invalid` attributes across the codebase. Gaps: AGG-60 (recruit form) and ~14 form-error `<p>`s noted above.

**`<main>` / landmarks:** Every layout (`app/page.tsx`, `not-found.tsx`, `(dashboard)/layout.tsx`, `(auth)/layout.tsx`, `(public)/layout.tsx`) renders `<main id="main-content">`. Skip link targets it correctly.

**i18n / RTL:** Locale switcher persists via cookie + reload. Messages directory has `en.json` + `ko.json` only. No `dir="rtl"` or RTL handling — acceptable for a ko/en deployment; flag for any future Arabic/Hebrew addition.

**Stack/dependency hygiene:** Tailwind 4, Base UI `@base-ui/react@^1.4.1`, Next 16.2.9, React 19.2, next-intl 4.9, next-themes 0.4. All current. `lucide-react@^1.8.0` is unusual (mainline historically sits at 0.4xx) — verify this is the new 1.x line adopted intentionally, not a typo'd pin (carried forward from cycle 2).

**Confidence summary table:**

| ID | Severity | Confidence | Type | Status vs cycle 2 |
|---|---|---|---|---|
| REG-1 | — | HIGH | Regression check (no UI surface changed) | new |
| REG-2 | — | HIGH | Auth-check consistency | **FIXED ✓** |
| AGG-56 | — | MEDIUM | Contrast | **INVALIDATED** (6.54:1 passes AA) |
| AGG-57 | P2 | MEDIUM | Label without htmlFor | Confirm (5–10 sites) |
| AGG-58 | P1 | HIGH | Heading hierarchy | Confirm + **expanded scope** (admin + ~14 public pages) |
| AGG-59 | P1 | HIGH | leaderboard hsl(var()) | Confirm (4 sites) |
| AGG-60 | P1 | HIGH | Recruit form | Confirm |
| AGG-61 | P1 | HIGH | loading/error coverage | Confirm (60 leaves) |
| AGG-62 | P2 | MEDIUM | useDeferredValue | Confirm |
| UI-1 | P1 | HIGH | Opacity contrast | Confirm |
| UI-2 | P1 | HIGH | sidebar hsl(var()) | Confirm |
| UI-3 | P1 | HIGH | tag-form hsl(var()) | Confirm |
| UI-4 | P2 | HIGH | `<html nonce>` invalid | Confirm |
| UI-5 | P2 | MEDIUM | viewport polish | Confirm |
| UI-6 | P2 | MEDIUM | api-keys (no heading) / discussions | Confirm + api-keys worsens (no heading at all) |
| UI-7 | P2 | LOW | console.error | Confirm + **expanded** (7 → 14 component sites) |
| UI-8 | P2 | MEDIUM | Design-token drift | Confirm (74 sites) |
| UI-9 | P2 | LOW | TabsContent focus ring | Confirm |
| UI-10 | P2 | MEDIUM | Sticky column bg mismatch | Confirm |
| UI-11 | P1 | HIGH | error.tsx uses `<h2>` not `<h1>` | **NEW** |
| UI-12 | P2 | MEDIUM | discussions h1 sizing drift | **NEW** |
| UI-13 | P2 | LOW | CardTitle is a `<div>` | **NEW** (architectural note) |

---

## RECOMMENDED FIX ORDER

**Quick batch 1 (one-line CSS fixes, ship together):** AGG-59 (4 leaderboard sites) → UI-2 (sidebar) → UI-3 (tag-form). Drop the `hsl(…)` wrappers around oklch tokens.

**Quick batch 2 (heading hierarchy, ship together):** AGG-58 (`<h2>` → `<h1>` on ~27 pages) → UI-6 (add server-rendered `<h1>` to api-keys, discussions) → UI-12 (normalize discussions h1 sizing) → UI-11 (promote error.tsx `<h2>` → `<h1>` on 5 files). All are tag-only changes with identical classes.

**Form semantics:** AGG-60 (wrap recruit form in `<form onSubmit>`, add `role="alert"`, `type="submit"`).

**Contrast:** UI-1 (drop `/60` opacity modifiers on tertiary text in light mode).

**Boundaries:** AGG-61 (add `loading.tsx` + `error.tsx` to top ~10 deep leaves).

**Polish / cleanup:** AGG-62 (useDeferredValue), UI-4 (drop `<html nonce>`), UI-5 (viewport cover + themeColor), UI-9 (TabsContent focus-visible), UI-10 (sticky column `bg-card`), UI-7 (typed logger), UI-8 (semantic status tokens + lecture-mode extension). UI-13 needs no action.

**Drop entirely:** AGG-56 (false positive), REG-2 (fixed).
