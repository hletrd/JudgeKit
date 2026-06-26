# Cycle 4 — designer

**Focus:** Re-validate the cycle-3 Designer P1 batch (AGG-58..AGG-61, UI-1..UI-13) that was DEFERRED in cycle 3, regression-check the three cycle-3 UI-adjacent changes (freezeLeaderboardAt strip, accepted-solutions count, rankings ISR), and run a final net-new WCAG 2.2 / color-only-state / Korean-letter-spacing / form-validation sweep.
**Date:** 2026-06-27
**HEAD reviewed:** `edd45cca`
**Method:** Static analysis only. `git diff 207623f9..edd45cca --name-only -- 'src/**/*.tsx' 'src/**/*.css'` returns **ZERO** `.tsx`/`.css` files changed between cycle 3 and cycle 4 — every touched file is an API route (`.ts`) or lib. The JSX/CSS surface is byte-identical to cycle 3, so every cycle-3 designer finding is re-confirmed by re-reading the same selectors (not by assumption). Dev-server browser pass not feasible; evidence is selectors + classes + computed token math.
**Framework (unchanged):** Next.js 16.2.9 + React 19.2 + Tailwind 4 + shadcn/Base UI `@base-ui/react@1.4.1` + next-intl 4.9 + next-themes 0.4.

---

## TL;DR (cycle 4 verdict)

- **Regression:** NONE. Zero UI files changed; the 3 UI-adjacent changes are all API-level and verified non-breaking for the rendered components (see REG-3..REG-5).
- **Deferred Designer P1 batch:** ALL STILL PRESENT VERBATIM. None of AGG-58..AGG-61 or UI-1..UI-13 were addressed this cycle. The remediation plan (`plan/cycle-3-2026-06-27-review-remediation.md` Phase B) explicitly carries the whole batch forward. They are re-confirmed below with fresh line numbers — do not re-litigate; pick them up.
- **Net-new:** Minimal (surface frozen). One quantified item — UI-14: 14 inline error `<p className="text-destructive">` without `role="alert"` (cycle 3 estimated "~14"; cycle 4 enumerates the exact set). Everything else I probed (icon-only buttons, color-only state, Korean letter-spacing) came back clean.
- **Convergence:** Not inflating. Real, fixable P1 set is unchanged from cycle 3 (4 items + 3 one-liner CSS defects). The cheap batch fixes are unchanged and still ship-in-an-afternoon.

---

## REGRESSION (cycle 3 → cycle 4)

### REG-3 (—, HIGH confidence) — No `.tsx`/`.css` changed between cycle 3 (`207623f9`) and cycle 4 (`edd45cca`)

**Evidence:** `git diff 207623f9..edd45cca --name-only -- 'src/**/*.tsx' 'src/**/*.css'` → empty. Touched files are all API routes / lib / Cargo: `api/v1/admin/roles/[id]/route.ts`, `api/v1/admin/settings/route.ts`, `api/v1/community/threads/route.ts`, `api/v1/community/votes/route.ts`, `api/v1/contests/[assignmentId]/export/route.ts`, `api/v1/groups/[id]/assignments/route.ts`, `api/v1/groups/[id]/assignments/[assignmentId]/route.ts`, `api/v1/problems/[id]/accepted-solutions/route.ts`, `api/v1/submissions/[id]/events/route.ts`, `lib/assignments/recruiting-invitations.ts`, `lib/validators/system-settings.ts`. No component, no page, no globals.css edit.
**Criterion:** Cycle-over-cycle UI regression risk = 0.

### REG-4 (CLEAN ✓, HIGH confidence) — `freezeLeaderboardAt` strip does not break the non-manager assignment card / leaderboard

**Change:** `api/v1/groups/[id]/assignments/[assignmentId]/route.ts:55-58` and `api/v1/groups/[id]/assignments/route.ts:82-85` now `delete … freezeLeaderboardAt` for non-managers (parallel to the existing `accessCode` strip).
**Consumer audit (UI side):** Every JSX reader of `freezeLeaderboardAt` is inside `AssignmentFormDialog`, which renders only under `{canManageGroup && (...)}` in `groups/[id]/page.tsx:287-288,374,380`. Managers still receive the field; non-managers never open the dialog. The non-manager assignment `<TableRow>` (`groups/[id]/page.tsx:343+`) renders title/description/deadline/problems — none read `freezeLeaderboardAt`. The leaderboard itself honors the freeze server-side (it shapes which score rows are returned), not via the client field. All three readers guard with `?:`/`?? null` anyway (`assignment-form-dialog.tsx:134`, `groups/[id]/page.tsx:333`, `contests/manage/[assignmentId]/page.tsx:259`).
**Criterion:** No null-deref, no broken render. No designer action.

### REG-5 (CLEAN ✓, HIGH confidence) — accepted-solutions `total` now matches rendered rows; rankings ISR correctly skipped

**(a) accepted-solutions count:** `api/v1/problems/[id]/accepted-solutions/route.ts:55-59` now joins `users` and adds `eq(users.shareAcceptedSolutions, true)` to the count WHERE, matching the rendered list's `.filter((s) => s.shareAcceptedSolutions)` at line ~95. The `AcceptedSolutions` component (`components/problem/accepted-solutions.tsx:80`) consumes `{ total, solutions }` from the API, so the rendered "X results" now matches the row count. Correctness improvement; no rendering regression.
**(b) rankings ISR:** `(public)/rankings/page.tsx:123` calls `await auth()`, which forces the route `dynamic`. There is no `export const revalidate`. A10d (ISR `revalidate=60`) was therefore correctly SKIPPED — it would have been a no-op. Confirmed by reading the page.

---

## DEFERRED DESIGNER P1 BATCH — re-confirmed verbatim on head `edd45cca`

All items below were deferred in cycle 3 (`plan/cycle-3-2026-06-27-review-remediation.md` Phase B, "Designer P1 batch"). Because zero UI files changed this cycle, each is re-confirmed by re-reading the same selector. Line numbers refreshed.

### AGG-58 — 27 pages emit `<h2>` as the page title with no `<h1>` — CONFIRMED, P1, HIGH confidence

**Criterion:** WCAG 2.2 Level A 1.3.1 (Info and Relationships) — heading hierarchy; AT users cannot jump-to-h1 on ~27 primary routes (the `(public)`/`(dashboard)` shell layouts render no `<h1>`).

**Exact sites on head `edd45cca` (27 — `grep -rn '<h2 className="text-2xl font-bold' src/app`):**

Admin (12): `dashboard/admin/workers/page.tsx:26`, `files/page.tsx:129`, `audit-logs/page.tsx:364`, `settings/page.tsx:441`, `languages/page.tsx:44`, `login-logs/page.tsx:242`, `tags/page.tsx:58`, `plugins/page.tsx:23`, `plugins/chat-logs/page.tsx:20`, `plugins/[id]/page.tsx:26`, `users/[id]/page.tsx:74`, `submissions/page.tsx:307`. (`admin/page.tsx:43` and `admin/roles/page.tsx:73` already use `<h1>` — leave them.)

Public / dashboard (15): `(public)/problems/page.tsx:547`, `problems/[id]/edit/page.tsx:73`, `problems/create/page.tsx:94`, `problem-sets/_components/problem-set-form.tsx:262`, `problem-sets/page.tsx:66`, `groups/page.tsx:213`, `groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx:175`, `profile/page.tsx:58`, `dashboard/page.tsx:40`, `practice/problems/[id]/rankings/page.tsx:129`, `contests/manage/[assignmentId]/students/[userId]/page.tsx:121`, `contests/manage/[assignmentId]/participant/[userId]/submissions/page.tsx:118`. Plus the two `sm:text-3xl` contest title variants: `contests/[id]/page.tsx:243`, `contests/manage/[assignmentId]/page.tsx:360`.

**Fix:** Tag-only swap `<h2 …>→<h1 …>` (identical class → identical visual size). 27 one-line edits, ship as one commit. (`api-keys` and `discussions` have no server-rendered page heading at all — see UI-6.)

### AGG-59 — `leaderboard-table.tsx` invalid `hsl(var(--border))` — CONFIRMED, P1, HIGH confidence

**Selector (4 sites, unchanged):** `src/components/contest/leaderboard-table.tsx:346, 349, 395, 414` — `shadow-[1px_0_0_0_hsl(var(--border))]` on sticky rank/name `<th>`/`<td>`. `--border` is `oklch(0.922 0 0)` / `oklch(1 0 0 / 10%)` dark; `hsl(oklch(…))` is unparseable, so the whole `box-shadow` is dropped and the sticky-column separator never renders in either theme.
**Fix:** `shadow-[1px_0_0_0_var(--border)]` (drop the `hsl(…)` wrapper), or `border-r border-border` on the sticky cells.

### AGG-60 — Recruit start form: no `<form>`, error has no `aria-live`, no `aria-busy` — CONFIRMED, P1, HIGH confidence

**Selector (unchanged):** `src/app/(auth)/recruit/[token]/recruit-start-form.tsx:116` wraps in `<div className="space-y-3">` (no `<form>`); Button at `:134-138` uses `onClick={handlePrimaryAction}` with no `type="submit"` (Enter-key does nothing in the password field); error at `:147` is `<p className="text-sm text-destructive text-center">{error}</p>` (no `role="alert"`/`aria-live`). Sibling auth forms (`login-form.tsx`, `signup-form.tsx`, `reset-password-form.tsx`, `forgot-password-form.tsx`) all use canonical `<form onSubmit>`.
**Criterion:** WCAG 2.2 Level A 3.2.2 (Predictable), A 4.1.3 (Status Messages), A 2.1.1 (Keyboard).
**Fix:** Wrap in `<form onSubmit={(e)=>{e.preventDefault(); void handlePrimaryAction();}}>`, make the Button `type="submit"`, add `role="alert"` to the error `<p>`. Keep the `<AlertDialog>` outside the form.

### AGG-61 — 60 of 67 leaf routes lack a local `loading.tsx`/`error.tsx` — CONFIRMED, P1, HIGH confidence

**Counts on head (unchanged):** 67 leaf `page.tsx`; **10** `loading.tsx` (~15%); **5** `error.tsx` (~7%). **60 leaf directories have NEITHER.** Existing boundaries: `(public)/`, `(public)/problems`, `(public)/groups`, `(public)/contests/manage`, `(dashboard)/`, `(dashboard)/dashboard/admin`, `(dashboard)/dashboard/admin/users`, `(dashboard)/dashboard/admin/submissions`, `(auth)/recruit/[token]/results`, `(public)/contests/manage/[assignmentId]/participant` (loading); `(public)`, `(public)/problems`, `(public)/groups`, `(public)/contests/manage`, `(dashboard)`, `(dashboard)/dashboard/admin` (error). Deep leaves (`contests/[id]`, `practice/problems/[id]/rankings`, `community/threads/[id]`, `profile`, `users/[id]`, every admin detail page) show the parent layout's spinner while their own segment resolves, and a server-component throw becomes a full 500 with no in-place recovery.
**Criterion:** Perceived performance (INP/LCP) + resilience (`error.tsx` is Next.js's only in-place recovery from a server throw).
**Fix:** Add `loading.tsx` (skeleton matching page chrome) + `error.tsx` (Card + retry) to the top ~10 deep leaves: `contests/[id]`, `practice/problems/[id]/rankings`, `community/threads/[id]`, `profile`, `users/[id]`, `submissions/[id]`, `problems/[id]`, `groups/[id]`, plus admin detail pages.

### UI-1 — `text-muted-foreground/60`, `text-foreground/60` ~2:1 contrast in light mode — CONFIRMED, P1, HIGH confidence

**Sites (unchanged):** `components/resource-usage-bar.tsx:77, 98` (`text-muted-foreground/60`); `components/layout/public-header.tsx:306` (avatar-dropdown eyebrow `text-muted-foreground/60`); `components/ui/tabs.tsx:66` (inactive `TabsTrigger` `text-foreground/60`, with `dark:text-muted-foreground` override so dark is fine).
**Math (light):** `oklch(0.48 0 0)` at 60% over white composites to ~0.466 → **2.03 : 1** (fails AA 4.5:1). `text-foreground/60` (`oklch(0.145 0 0)` at 60%) → ~**2.32 : 1** (fails). Dark mode passes.
**Criterion:** WCAG 2.2 Level AA 1.4.3 (Contrast — Minimum).
**Fix:** Drop `/60` in light mode; use `text-muted-foreground` alone (~6.5:1) or a weight/size step for hierarchy.

### UI-2 — `sidebar.tsx` invalid `hsl(var(--sidebar-border))` / `hsl(var(--sidebar-accent))` — CONFIRMED, P1, HIGH confidence

**Selector (unchanged):** `components/ui/sidebar.tsx:473` — `SidebarMenuButton` variant `"outline"`: `shadow-[0_0_0_1px_hsl(var(--sidebar-border))] … hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]`. Same oklch-in-hsl defect as AGG-59; the outline ring + hover ring are silently invisible.
**Fix:** `shadow-[0_0_0_1px_var(--sidebar-border)]` + `hover:shadow-[0_0_0_1px_var(--sidebar-accent)]`.

### UI-3 — `tag-form-fields.tsx` inline `hsl(var(--foreground))` borderColor — CONFIRMED, P1, HIGH confidence

**Selector (unchanged):** `(dashboard)/dashboard/admin/tags/tag-form-fields.tsx:63` — `borderColor: value.color === c ? "hsl(var(--foreground))" : "transparent"`. Selected color swatch loses its border highlight in both themes.
**Criterion:** WCAG 2.2 Level A 4.1.2 (Name, Role, Value — "states").
**Fix:** `"var(--foreground)"`.

> Note: `grep -rn 'hsl(var(--' src --include=*.tsx --include=*.ts` (excluding `--radius`) returns **exactly these three files** (leaderboard-table ×4, sidebar ×1, tag-form-fields ×1). The HSL→oklch migration is otherwise complete; these 6 occurrences are the entire remaining set and can all be fixed by dropping the `hsl(…)` wrapper.

### UI-4 — `<html nonce={nonce}>` is invalid HTML — CONFIRMED, P2, HIGH confidence

**Selector (unchanged):** `app/layout.tsx:100` — `<html … nonce={nonce}>`. Per HTML spec `nonce` is valid only on `<script>/<style>/<link>/<iframe>`, not `<html>`; browsers ignore it for CSP. The real nonce delivery is the CSP response header + `NonceProvider` (`:118`).
**Fix:** Remove `nonce={nonce}` from `<html>`.

### UI-5 — Viewport missing `viewport-fit`/`themeColor` — CONFIRMED, P2, MEDIUM confidence

**Selector (unchanged):** `app/layout.tsx:23-26` — `{ width: "device-width", initialScale: 1 }` only. Missing `viewportFit: "cover"` (needed for `env(safe-area-inset-*)` on the full-screen recruit flow + code editor) and a `themeColor` pair. (No `maximum-scale` cap — good for AAA 1.4.4; keep.)
**Fix:** Add `viewportFit: "cover"` and `themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#242424" }]`.

### UI-6 — `api-keys` page has no heading; `discussions` heading is client-only — CONFIRMED, P2, MEDIUM confidence

**Selectors (unchanged):** `(dashboard)/dashboard/admin/api-keys/page.tsx` returns only `<ApiKeysClient>` — no `<h1>/<h2>/<h3>` server-side; the in-client `CardTitle` (`api-keys-client.tsx:325`) renders as a `<div>` (UI-13), so the page has **zero** heading semantics. `(dashboard)/dashboard/admin/discussions/page.tsx` defers its `<h1>` to the client (`discussion-moderation-list.tsx:46`) → hidden until hydration (LCP/CLS) and inconsistent with sibling pages.
**Fix:** When applying AGG-58, add a server-rendered `<h1 className="text-2xl font-bold">` to both `page.tsx`; demote the in-client discussions `<h1>` to `<h2>`.

### UI-7 — `console.error/log` in production component bundles — CONFIRMED, P2, LOW confidence

**Scale (unchanged from cycle 3):** 7 component files + 7 app-side dialog/form files. Component set: `submissions/_components/comment-section.tsx`, `problem/problem-import-button.tsx`, `discussions/discussion-post-form.tsx`, `discussions/discussion-post-delete-button.tsx`, `discussions/discussion-thread-moderation-controls.tsx`, `discussions/discussion-thread-form.tsx`, `code/compiler-client.tsx`. App set: `admin/roles/role-delete-dialog.tsx`, `admin/roles/role-editor-dialog.tsx`, `admin/languages/language-config-table.tsx`, `admin/settings/database-backup-restore.tsx`, `admin/users/bulk-create-dialog.tsx`, `problems/create/create-problem-form.tsx`, `groups/create-group-dialog.tsx`. Error-boundary `console.error` are correctly dev-gated — those are fine.
**Fix:** Route through a typed client-safe logger that no-ops in production.

### UI-8 — Design-token drift: hardcoded `bg-green-*`/`text-yellow-*`/etc. — CONFIRMED, P2, MEDIUM confidence

**Scale:** `grep -rEn '(bg|text|border)-(green|yellow|blue|red|orange|purple)-(100|200|300|500|600|700|800)'` returns ~64–74 hits (cycle 3 reported 74 with a slightly broader pattern). Pervasive in `contest/leaderboard-table.tsx`, `contest/anti-cheat-presentation.ts`, `ui/badge.tsx:24`, `contest/participant-timeline-view.tsx`, `api-keys-client.tsx`, `file-upload-dialog.tsx`. Status colors are inlined as Tailwind palettes and do NOT recolor under lecture-mode themes (`.lecture-theme-*` at `globals.css:404-500` redefine semantic tokens only).
**Criterion:** Visual cohesion; lecture-mode accessibility (a low-vision user who picks a high-contrast lecture theme expects status indicators to recolor — they don't).
**Fix:** Add `--success/--warning/--info/--danger` semantic tokens, map the inline palettes to them, and extend the lecture-theme blocks to redefine those four tokens.

### UI-9 — `TabsContent` `outline-none` with no `focus-visible` replacement — CONFIRMED, P2, LOW confidence

**Selector (unchanged):** `components/ui/tabs.tsx:81` — `className={cn("flex-1 text-sm outline-none", className)}`. `TabsTrigger` (`:66`) has full `focus-visible:ring-[3px] …`; `TabsContent` does not.
**Criterion:** WCAG 2.2 Level AA 2.4.7 (Focus Visible).
**Fix:** `outline-none focus-visible:ring-2 focus-visible:ring-ring/50` (only load-bearing if the panel receives `tabindex`).

### UI-10 — Sticky column `bg-background` mismatches Card `bg-card` in dark mode — CONFIRMED, P2, MEDIUM confidence

**Selector (unchanged):** `contest/leaderboard-table.tsx:345-346,349` — sticky header row + sticky rank/name cells use `bg-background`. Light mode: `--background`=`--card`=`oklch(1 0 0)` (no seam). Dark mode: `--background`=`oklch(0.145 0 0)` vs `--card`=`oklch(0.205 0 0)` (~7% lightness delta) → visible color mismatch on the sticky edge as rows scroll under it. Combined with AGG-59 (no separator), sticky columns read as a rendering bug.
**Fix:** `bg-card` (or `bg-inherit`) on sticky cells + the AGG-59 separator.

### UI-11 — All 5 `error.tsx` render `<h2>` not `<h1>` — CONFIRMED, P1, HIGH confidence

**Selectors (unchanged):** `(dashboard)/error.tsx:20`, `(dashboard)/dashboard/admin/error.tsx:27`, `(public)/problems/error.tsx:27`, `(public)/groups/error.tsx:27`, `(public)/contests/manage/error.tsx:29` — all `<h2 className="text-2xl font-semibold">{t("errorTitle")}</h2>`. When the boundary replaces the segment, the page's original heading is unmounted, leaving the error screen with no `<h1>`.
**Criterion:** WCAG 2.2 Level A 1.3.1 / 4.1.2.
**Fix:** Promote `<h2>` → `<h1>` in all 5 files (identical class).

### UI-12 — `discussion-moderation-list.tsx` `<h1>` at `text-3xl` drifts from sibling pages — CONFIRMED, P2, MEDIUM confidence

**Selector (unchanged):** `components/discussions/discussion-moderation-list.tsx:46` — `<h1 className="text-3xl font-semibold…">`. Sibling admin pages are `text-2xl font-bold`. After AGG-58/UI-6 normalize them to `<h1 className="text-2xl font-bold">`, discussions will be the lone `text-3xl` page.
**Fix:** Normalize to `<h1 className="text-2xl font-bold">` (server-rendered in `page.tsx` per UI-6).

### UI-13 — `<CardTitle>` is a `<div>`, so 143 card titles have no heading semantics — CONFIRMED (architectural), P2, LOW confidence

**Selector (unchanged):** `components/ui/card.tsx:36-40` — `CardTitle` renders `<div data-slot="card-title">`. ~143 sites. Standard shadcn tradeoff; only a problem where a `CardTitle` is the page's *only* heading-like element (e.g. `api-keys` per UI-6). No action for cards nested under a real `<h1>`.

---

## NEW UI/UX FINDINGS (cycle 4)

### UI-14 — 14 inline error `<p className="text-destructive">` lack `role="alert"` (enumerated) — NEW, P3, MEDIUM confidence

Cycle 3's final sweep estimated "~14 form-error `<p>`s" without `role="alert"`/`aria-live`. Cycle 4 enumerates the exact set: `grep -rn '<p[^>]*text-destructive' src` returns 26 total; **14** have no `role="alert"`:

| File:line | Kind |
|---|---|
| `components/problem/function-signature-builder.tsx:156, 169, 186, 279` | Form-validation errors (4) |
| `components/problem/function-test-case-editor.tsx:284, 305` | Form-validation errors (2) |
| `components/contest/code-timeline-panel.tsx:138` | fetchError status |
| `components/contest/anti-cheat-dashboard.tsx:339` | fetchError status |
| `components/contest/analytics-charts.tsx:569` | fetchError status |
| `components/contest/leaderboard-table.tsx:283` | fetchError status |
| `components/contest/participant-anti-cheat-timeline.tsx:203` | fetchError status |
| `(auth)/recruit/[token]/recruit-start-form.tsx:147` | already covered by AGG-60 |
| `(auth)/signup/signup-form.tsx:218` | password-mismatch (icon+text, but no live region) |
| `change-password/change-password-form.tsx:141` | password-mismatch (icon+text, but no live region) |

**Criterion:** WCAG 2.2 Level A 4.1.3 (Status Messages) — SR users get no announcement when these errors appear.
**Fix:** Add `role="alert"` (for validation/fetch errors that appear on a state change). For the password match/mismatch `<p>` in signup/change-password, also consider `aria-describedby` linking the `<p id>` to the confirm-password input. Purely additive attribute changes; no visual change. P3 because none block task completion and the surrounding inputs are still operable.

---

## SWEEPS THAT CAME BACK CLEAN (cycle 4 — no new findings)

- **Icon-only buttons (`size="icon"`):** 11 sites; **all 11 carry `aria-label`** (`locale-switcher.tsx:58`, `code/copy-code-button.tsx:35`, `admin/workers/workers-client.tsx:135,189,206`, `admin/api-keys/api-keys-client.tsx:478`, `admin/settings/footer-content-form.tsx:166`, plus the layout theme/accessibility toggles). No net-new finding.
- **Color-only state indicators:** audited the likely suspects — workers online/stale/offline is a Badge with a **text label** (`workers-client.tsx:74-84`, `statusVariant` maps to variant only); the disk-usage bar has full `role="progressbar" aria-valuenow aria-valuemin aria-valuemax aria-label` with the numeric `%` also shown as text (`language-config-table.tsx:384-394`); verdict colors in `leaderboard-table.tsx` always accompany a verdict string. No state is conveyed by hue alone.
- **Korean letter-spacing (CLAUDE.md rule):** CLEAN. 44 `tracking-*` sites; every one is either behind a `locale !== "ko"` ternary (`headingTracking`), on `font-mono` alphanumeric access codes with an explanatory comment (`access-code-manager.tsx:154`, `contest-join-client.tsx:123`), on the literal numeric `"404"` (`not-found.tsx:58`, `(public)/not-found.tsx:24`), or on English-uppercase eyebrows with a comment (`public-header.tsx:305`, `public-home-page.tsx:75`, `recruit/[token]/results/page.tsx:268,279`). The `html:lang(ko)` token override (`globals.css:131-136`) is the global backstop. No regression.
- **Modals / focus traps:** `Dialog`/`AlertDialog`/`Select`/`DropdownMenu` delegate keyboard + focus-trap to `@base-ui/react` (native arrow-key nav, type-ahead, Escape, focus restore). Mobile menu trap verified in cycle 3. Unchanged.
- **Reduced motion / dark mode / landmarks / skip-link / i18n:** all unchanged from cycle 3's FINAL SWEEP (still good).

---

## CONFIDENCE SUMMARY (cycle 4)

| ID | Sev | Conf | Status vs cycle 3 |
|---|---|---|---|
| REG-3 | — | HIGH | new — zero UI files changed |
| REG-4 | — | HIGH | new — freezeLeaderboardAt strip non-breaking |
| REG-5 | — | HIGH | new — count fix correct; ISR correctly skipped |
| AGG-58 | P1 | HIGH | Confirm (27 sites, exact list) |
| AGG-59 | P1 | HIGH | Confirm (4 sites) |
| AGG-60 | P1 | HIGH | Confirm |
| AGG-61 | P1 | HIGH | Confirm (60 leaves) |
| UI-1 | P1 | HIGH | Confirm |
| UI-2 | P1 | HIGH | Confirm |
| UI-3 | P1 | HIGH | Confirm |
| UI-4 | P2 | HIGH | Confirm |
| UI-5 | P2 | MED | Confirm |
| UI-6 | P2 | MED | Confirm |
| UI-7 | P2 | LOW | Confirm (14 files) |
| UI-8 | P2 | MED | Confirm (~64–74 sites) |
| UI-9 | P2 | LOW | Confirm |
| UI-10 | P2 | MED | Confirm |
| UI-11 | P1 | HIGH | Confirm (5 error.tsx) |
| UI-12 | P2 | MED | Confirm |
| UI-13 | P2 | LOW | Confirm (architectural) |
| UI-14 | P3 | MED | **NEW** — 14 error `<p>` without `role="alert"` (enumerated) |

---

## RECOMMENDED FIX ORDER (unchanged from cycle 3 — none shipped)

**Batch 1 — one-line CSS (ship together, one commit):** AGG-59 (4 leaderboard sites) → UI-2 (sidebar) → UI-3 (tag-form). Drop `hsl(…)` wrappers around oklch tokens. These are the *entire* remaining `hsl(var(--token))` set.

**Batch 2 — heading hierarchy (tag-only, one commit):** AGG-58 (`<h2>`→`<h1>` on 27 pages) → UI-6 (add server `<h1>` to api-keys + discussions) → UI-12 (normalize discussions sizing) → UI-11 (`<h2>`→`<h1>` in 5 error.tsx).

**Batch 3 — form semantics:** AGG-60 (wrap recruit form in `<form onSubmit>`, `type="submit"`, `role="alert"`).

**Batch 4 — contrast:** UI-1 (drop `/60` opacity modifiers on tertiary text in light mode).

**Batch 5 — boundaries:** AGG-61 (`loading.tsx` + `error.tsx` on top ~10 deep leaves).

**Cleanup (P2/P3, ride-along):** UI-14 (`role="alert"` on 14 error `<p>`), UI-4 (drop `<html nonce>`), UI-5 (viewport cover + themeColor), UI-9 (TabsContent focus-visible), UI-10 (sticky `bg-card`), UI-7 (typed logger), UI-8 (semantic status tokens + lecture-mode extension). UI-13 needs no action.

**Batches 1 and 2 are the highest leverage and remain trivially cheap — they should not defer a fifth cycle.**
