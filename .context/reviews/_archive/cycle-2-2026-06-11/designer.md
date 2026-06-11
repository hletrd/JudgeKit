# Designer (UI/UX + a11y) — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035 (main)
**Method:** static markup/a11y review of the cycle-1 UI surface + key exam
flows. Live agent-browser pass remains blocked (DEFER-ENV-GATES: requires a
running server + provisioned Postgres reachable from the review env); all
findings below are backed by text-extractable evidence (selectors, classes,
ARIA) per the multimodal caveat.

## Findings

### DES2-1 — Windowed-exam countdown does not reflect a live extension (LOW-MEDIUM, High confidence — UX face of V2-1)
`groups/[id]/assignments/[assignmentId]/page.tsx:196-201`: `CountdownTimer`
gets a fixed epoch. For the student the moment of expiry is the highest-
anxiety moment in the product; if staff extended them mid-session the timer
still hits 0 and the UI offers no path but a manual reload. Recommended UX:
refetch the session deadline (GET exam-session exists) on an interval and on
`visibilitychange`; when the deadline moves later, the countdown should
visibly extend (and a small `role="status"` note "your deadline was extended
by staff" defuses the confusion in both en/ko).

### DES2-2 — ExamExtendDialog ergonomics (LOW, High confidence)
`exam-extend-dialog.tsx`: (a) `<Input type="number">` without
`inputMode="numeric"` → full keyboard on mobile (staff often proctor from a
tablet); (b) no Cancel button in `DialogFooter` and no form-submit on Enter —
sibling `score-override-dialog` sets the local convention; match it where
cheap. The trigger button's `size-5` hit target is below the 24×24 CSS px
WCAG 2.2 target-size minimum (2.5.8) — acceptable as AA-level exception
(inline target), but consider `size-6`+padding if touched anyway.

### DES2-3 — Positive notes (keep)
- The amber overrides-active banner (`system-settings-form.tsx:57-69`) uses
  `role="status"`, the established yellow-700/dark:yellow-400 contrast
  pair, and plain-language consequence copy in both locales.
- The draft-recovered toast copy ("This is your own saved work…") directly
  addresses the exam-stress misread; time-stamped variant is the right call.
- ipOverlap advisory panel renders only when non-empty, uses
  `role="region"` + aria-label, and includes the benign-explanations hint —
  good restraint against false-accusation UI.
- The `/problems` number-column hint ships as `title` + `sr-only` text in
  both locales; numbering ambiguity is now discoverable without a tooltip
  pointer device.

## Korean typography check (CLAUDE.md rule)
Verified: no `tracking-*` utilities or custom `letter-spacing` were added to
any Korean-rendering markup in the cycle-1 diff (grep over the diff files
returned only pre-existing Latin-context classes). Rule holds at HEAD.

## Carried
- ST2 expired-editor state (design needed: "time expired, draft saved").
- DES-ENV live browser pass (exit: provisioned staging host).
