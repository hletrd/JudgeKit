# Designer Review — cycle 2 (2026-06-16, browser-driven)

Browser-driven responsive review of the `function` problem-type UI, the user's
primary focus this run. Driven with `agent-browser` (Chromium, headless) against
a live `next dev` server on `http://localhost:3110` seeded with a real function
problem (`twoSum`, params `int[] nums, int target`, return `int[]`, 7 enabled
languages, python reference). Viewports: mobile 375×812, tablet 768×1024,
desktop 1280×900. All findings are backed by text-extractable box metrics
(`getBoundingClientRect`, `offsetLeft`, `scrollLeft/scrollWidth/clientWidth`,
computed `justify-content`) — no reliance on raw screenshots.

## SURFACES EXERCISED
- Authoring edit: `/problems/[id]/edit` (problemType=function):
  FunctionSignatureBuilder (name input, param rows + type selects, return-type
  select, 7-language multiselect), FunctionTestCaseEditor (typed per-param +
  expected-return inputs, add/remove, visible toggle), FunctionReferenceSolution
  (gated language picker, CodeEditor, compute button, stub-preview `<pre>`).
- Authoring create: `/problems/create` with problemType switched to function.
- Student submit: `/practice/problems/[id]` (stub-preloaded editor, gated
  language dropdown, problem tab bar).

## DSG-1 (Medium) Active/first problem tab is clipped on an overflowing tab bar — RESPONSIVE DEFECT (NEW)
- Surface: `/practice/problems/[id]` (student submit), all widths where the
  4-tab bar overflows its cap (confirmed at mobile 375; the cap is `max-w-full`,
  so it overflows whenever the 4 tabs exceed the container width).
- File: `src/components/ui/tabs.tsx:27` — `tabsListVariants` uses
  `justify-center` together with `overflow-x-auto`.
- Evidence (mobile 375, fresh load, no user scroll):
  - `[role=tablist]`: `scrollLeft=0`, `scrollWidth=375`, `clientWidth=343`,
    `overflowX=auto`, rect x=16 (page `px-4`).
  - First/active tab "Problem": `offsetLeft=-13`, rect x=-13 → its left ~29px is
    **clipped left of the list's content box**; `activeFullyVisible=false`.
  - Last tab "Problem discussion": rect right=388 (> 375 viewport).
- Why it's a defect: `justify-center` centers an OVERFLOWING flex scroll
  container, splitting the overflow to BOTH ends. The left-clipped portion is
  unreachable because the scroll origin is already at its left limit
  (`scrollLeft=0`), so the **active tab's label is permanently truncated** on the
  primary student surface with no scroll affordance to recover it.
- Root-cause confirmation (in-browser experiment): setting
  `justify-content: flex-start` on the live list moved `offsetLeft -13 → 19`
  (flush with the 3px padding box), `activeFullyVisible=true`, and the list still
  scrolls (`scrollWidth=406 > clientWidth=343`) to reveal the remaining tabs.
  Toggling `flex:none/shrink-0` on the tabs did NOT move anything (`-13`
  unchanged) → `flex-1` is not the cause; `justify-center` is.
- Non-regression: at desktop 1280 the list is `w-fit` (406px, `canScroll=false`)
  and `firstOffsetLeft=99` is identical before and after `justify-start` (a
  `w-fit` flex box has no free space to justify), so the fix is a no-op for the
  fits-in-one-row case and only repairs the overflow case.
- Fix: change `justify-center` → `justify-start` in `tabsListVariants`.
- Confidence: High. Severity Medium (active control clipped/inaccessible on the
  main student page at mobile; NOT a page-level scroll regression — page
  `documentWidth==viewportWidth`, so it slips past the existing overflow guard).

## CLEARED (checked, NOT defects — recorded to avoid re-flagging)
- Page-level horizontal overflow: `documentWidth - innerWidth == 0` on the edit
  page (375/768/1280), the create page (375), and the student page (375/768/1280)
  — the cycle-1 `max-w-full` TabsList cap holds; no page bleeds.
- Stub-preview `<pre>`: `overflow-auto`, never pushes the doc wider (right=326 <
  375 at mobile); scrolls internally as intended.
- Param-type selects / return-type select / fn-name input / languages
  multiselect / test-case inputs: all within viewport at every width; the
  languages grid wraps cleanly (`grid-cols-2` → `sm:grid-cols-3`).
- Small (16×16) checkboxes (language multiselect, "Visible to users", and the
  app-wide "Show compile errors"/"Allow AI Assistant" toggles): below the WCAG
  2.2 (2.5.8) 24×24 target minimum in raw size, BUT the nearest checkbox-to-
  checkbox centre distance is 28px (≥24px) so the **spacing exception is met**;
  the clickable `<label>` is 135px wide. These are shadcn/ui app-wide defaults,
  not function-judging-specific, and were already cleared in cycle 1 — NOT a new
  finding.

## KOREAN TYPOGRAPHY
No custom `letter-spacing`/`tracking-*` added or proposed. The fix touches only
`justify-content` (alignment), never glyph spacing.
