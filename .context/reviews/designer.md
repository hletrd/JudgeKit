# Designer (UI/UX + a11y) — RPF Cycle 1 (2026-06-11)

**HEAD reviewed:** f977ef4c. Net-new UI this cycle: fullscreen-editor focus
modal, side-by-side diff markers, contrast fixes, responsive contest cards,
tag-dialog/collapsible hydration fixes, countdown-timer hydration guard, admin
settings additions (2 override checkboxes + zip-size field), stable problem
numbers, recruiting consent line.

**Method note (consistent with all prior RPF cycles in this repo):** a live
agent-browser pass requires a running Next.js server + provisioned Postgres,
which this environment does not have; the markup/accessibility contract is
reviewed statically with selector/class-level evidence, and the repo's own
a11y guard tests (`a11y-review-fixes-implementation.test.ts`,
header-viewport Playwright suite) are used as executable evidence where they
exist. Live-browser verification remains a provisioned-host task
(carried DEFER-ENV-GATES).

## Verified good (markup-level evidence)
- **Fullscreen editor modal (c6cdfbe7):** `role="dialog"` + `aria-modal` +
  `aria-label`, focus moved in on open, Tab/Shift-Tab wrap, focus restored on
  close — closes the WCAG 2.4.3 trap. Escape also exits CodeMirror's Tab
  capture separately (238f240e) → WCAG 2.1.2 satisfied at both layers.
- **Diff add/remove markers (604646bb):** dedicated `+`/`-` `<td>` column on
  BOTH panels — not color-alone (WCAG 1.4.1). Marker cells are plain text and
  read naturally in sequence for screen readers.
- **Contrast (22141e82):** `text-yellow-700` on light (dark keeps
  `yellow-400`) — meets 4.5:1 against the white/`muted` backgrounds used.
- **Contest cards (77262773):** `flex-col gap-3 sm:flex-row` + `flex-wrap`
  badge cluster — no fixed-width `shrink-0` overflow on 320–768 px. Title
  truncation retained; tap targets unchanged (whole card is the link with a
  visible `focus-visible:ring-2`).
- **Hydration errors removed** (d280a45f, 82059635, ebdfaafb): React #418 on
  timer text (suppressHydrationWarning scoped to the two time nodes only) and
  invalid button nesting in tag dialogs / collapsible triggers — the latter
  were real HTML-validity bugs (interactive inside interactive), not just
  console noise.
- **Korean letter-spacing rule:** grep over the delta shows no `tracking-*`
  utility added to any Korean-rendering markup (38b5e893 removed the one
  violation: menu shortcut `tracking-widest`). Compliant.

## Findings

### UX1 — Per-viewer "stable" numbers can desync a classroom (LOW, confidence High)
`/problems` numbers rank the *viewer's* visible set
(`problems/page.tsx:464-482` comment admits this). Instructor says "open
problem 37"; a student in fewer groups sees a different #37. `/practice`
(public catalog) is viewer-independent and fine. Mitigation options: tooltip
("numbering is personal to your catalog view"), or rank within a
viewer-independent scope. LOW; pairs with perf P1 — fix both in one pass.

### UX2 — Admin restricted-mode override checkboxes lack consequence copy (LOW, confidence Medium)
`system-settings-form.tsx` adds `allowAiAssistantInRestrictedModes` /
`allowStandaloneCompilerInRestrictedModes` as labeled checkboxes (Label↔id
associated — fine technically). The labels don't warn that these are GLOBAL
and affect live exams immediately; the plausible failure is enabling for a
workshop and forgetting before an exam (critic #5). Add helper text + a
visible "overrides active" indicator near the platform-mode selector.

### UX3 — Draft recovery is silent (LOW, confidence Medium)
`use-server-source-draft.ts` restores a server draft into an empty editor with
no notice. A student returning on a new device sees code appear without
explanation ("did the site submit this? is this mine?"). A small toast/badge
("Recovered unsubmitted draft from <time>") would convert a trust-ambiguous
moment into a trust-building one. (The sonner toast util is already a
dependency.)

## Final sweep
Checked the delta for: missing focus-visible on new interactive elements
(none added without), new images without alt (none), form inputs without
labels (admin zip-size field has Label htmlFor), reduced-motion (no new
animation), i18n keys for all new strings (en+ko present). No further
findings.
