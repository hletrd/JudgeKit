# Designer — Live responsive review (browser-driven) of function-judging UI (cycle 1, 2026-06-16)

Method: Playwright (chromium) against a local `next dev` server on :3110 with a
seeded admin and a real `function` problem (twoSum: `int[] nums, int target -> int[]`,
all 7 function-judging languages enabled). Loaded each surface at mobile 375,
tablet 768, desktop 1280. Findings are backed by computed box metrics (text
extractable; model is treated as non-multimodal).

## CONFIRMED DEFECT

### DSGN-1 (High) Student problem-detail tab bar overflows the viewport on mobile
Surface: `/practice/problems/[id]` (the student submit page — primary focus).
Viewport: 375×812. Measured: `document.documentElement.scrollWidth = 422px` vs
viewport `375px` → 47px horizontal overflow of the whole page.
Offending element (leaf): `div[data-slot="tabs-list"]` with classes
`group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] ... overflow-x-auto scrollbar-none`
— box: left=16, right=422, width=406, scrollWidth=406. Its children are the four
triggers Problem / Editorial / Accepted Solutions / Problem discussion
(e.g. the "Problem discussion" trigger: left=284, right=419, width=135).
Root cause: `tabsListVariants` in `src/components/ui/tabs.tsx:27` declares
`inline-flex w-fit ... overflow-x-auto scrollbar-none` but NO width cap. `w-fit`
sizes the list to its content (406px); with no `max-w-full`/`w-full` the box is
never constrained to the parent, so `overflow-x-auto` never engages and the
oversized list pushes the document wider than the viewport. Every page using a
many-tab `TabsList` at narrow widths is affected (the student problem page is the
one in this run's focus). Fix: add `max-w-full` to the base variant so the list
caps at its container and the existing `overflow-x-auto scrollbar-none` lets the
triggers scroll horizontally instead of overflowing the page. Confidence: High.

## PASSED (no overflow / within viewport at 375/768/1280)
- Authoring edit page (`/problems/[id]/edit`, problemType=function): the three
  function sections (FunctionSignatureBuilder, FunctionTestCaseEditor,
  FunctionReferenceSolution) all render with NO horizontal overflow at all three
  widths. The signature builder's `flex-wrap` param rows wrap cleanly; the
  `min-w-[160px]` name input + `min-w-[120px]` type select + trash button fit
  within 375px (they wrap, trash button stays attached on its own line only when
  needed). Return-type select (`max-w-[200px]`) and language checkboxes
  (`grid-cols-2 sm:grid-cols-3`) stay within bounds.
- Stub-preview `<pre>` (`max-h-[260px] overflow-auto whitespace-pre`): contained;
  scrolls internally, does not push the page.
- Create page (`/problems/create`) after switching the type selector to
  "function": function sections render, no overflow at 375.

## NOTES
- Korean typography rule: no custom `letter-spacing`/`tracking-*` is applied to
  any function-judging component or to `ui/tabs.tsx`; the fix adds only
  `max-w-full`. Rule preserved.
- The authoring UI being clean is a real positive — the recently-shipped builder
  components were designed responsively (flex-wrap, min-w + grid). The single
  defect is in the shared Tabs primitive, surfaced on the student page.
