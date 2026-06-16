# Designer Review — cycle 3 (2026-06-16, browser-driven)

Fresh browser-driven responsive review of the `function` problem-type UI, the
user's primary focus this run. Driven with `agent-browser` 0.22.2 (Chromium,
headless) against a live `next dev` server on `http://localhost:3110`, backed by
a fresh seeded Postgres (`db:push` + `seed` + `languages:sync`) and a real
function problem minted via the authenticated API (`twoSum`, params
`int[] nums, int target`, return `int[]`, 7 enabled languages, python
reference). Viewports: mobile 375×812, tablet 768×1024, desktop 1280×900; both
light and dark `prefers-color-scheme`. All findings are backed by
text-extractable box metrics (`getBoundingClientRect`, `scrollLeft/scrollWidth/
clientWidth`, computed `justify-content`) — no reliance on raw screenshots.

## SURFACES EXERCISED (live)
- Authoring edit `/problems/[id]/edit` (problemType=function):
  FunctionSignatureBuilder (`#fn-name`, 2 param-type selects + return-type
  `#fn-return-type`, 7-language checkbox grid), FunctionTestCaseEditor (6 typed
  per-param + expected-return inputs), FunctionReferenceSolution (gated language
  picker, CodeEditor, compute button, stub-preview `<pre>`).
- Student submit `/practice/problems/[id]`: 4-tab problem bar, stub-preloaded
  editor, gated language dropdown, run-result panel markup.
- Authoring create `/problems/create` (problemType switched to function) — the
  base-ui Select selection does not commit under a synthetic agent-browser
  `.click()` (a harness limitation, not a product defect); this surface stays
  covered by the existing passing Playwright spec
  (`function-judging-responsive.spec.ts` "Mobile: create page function sections
  render after switching type").

## RESULT: NO NEW RESPONSIVE DEFECTS — DSG-1 FIX VERIFIED LIVE
The cycle-2 fix (`justify-center` → `justify-start` in `tabsListVariants`,
`src/components/ui/tabs.tsx:32`) is live and holding. Concrete live metrics:

- Student `/practice/problems/[id]` tab bar @ mobile 375 (fresh load, no scroll):
  `justifyContent=flex-start`, `scrollWidth=406 > clientWidth=343` (scrolls),
  active "Problem" tab `left=19 >= list.left=16` → `notClippedLeft=true`,
  `fullyVisible=true`. (Cycle-2 defect was `offsetLeft=-13` clipped left.) Page
  `docWidth==innerWidth==375`, `overflow=0`. The single element whose rect
  exceeds 375 (the last tab "Problem discussion", `right=419`) lives INSIDE the
  `overflow-x-auto` tablist and is reachable by scroll — intended, not a defect
  (cycle-2 cleared the same last-tab overflow).
- Student tab bar @ tablet 768 & desktop 1280: `flex-start`, active tab fully
  visible, `overflow=0`, `bleedCount=0`.
- Edit page @ 375 / 768 / 1280: `overflow=0`, `bleedCount=0` at every width.
  Sub-elements @ mobile 375: `#fn-name` right=326 (<375); `#fn-return-type`
  right=249 (w=200, respects `max-w-[200px]`); 3 type selects, 0 overflow; 7
  language labels, 0 overflow (grid `grid-cols-2 sm:grid-cols-3` wraps); stub
  `<pre>` right=326, `overflowX=auto` (scrolls internally, never bleeds).
- Edit page @ mobile 375 DARK mode: `overflow=0`; 6 test-case inputs
  (`grid sm:grid-cols-2`), 0 overflow; CodeEditor right=325 (<375).
- Create page @ mobile 375 (function): `overflow=0`, `bleedCount=0`, tab bar
  `flex-start`, active tab fully visible.

## CLEARED (checked live, NOT defects)
- Page-level horizontal overflow: 0 on edit (375/768/1280) and student
  (375/768/1280) and create (375) — the `max-w-full` TabsList cap (cycle 1) +
  `justify-start` (cycle 2) hold; no page bleeds.
- Run-result panel (`problem-submission-form.tsx:484-533`): all `<pre>` use
  `whitespace-pre-wrap overflow-auto max-h-40`, so long stdout/stderr/compile
  output wraps and never widens the document. Action buttons row
  (`flex gap-2`, two `flex-1` buttons) splits evenly. Top language/upload row is
  `flex flex-col gap-2 sm:flex-row` — stacks on mobile. No overflow risk.
- FunctionReferenceSolution stub `<pre>`: `max-h-[260px] overflow-auto
  whitespace-pre` — scrolls in both axes internally, contained at all widths.

## KOREAN TYPOGRAPHY
No custom `letter-spacing`/`tracking-*` added or proposed this cycle.
</content>
</invoke>
