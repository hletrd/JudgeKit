# Designer (UI/UX) review — RPF cycle 4 (2026-06-11)

**HEAD reviewed:** 7c0a4bd4.
**Lens:** UI/UX. Constraint: no provisioned browser/dev server in this run
environment (DEFER-ENV-GATES, carried since cycle 1) — this is a static review
of components, markup, ARIA, and i18n; findings are labeled accordingly.

## DES4-1 — Exam-surface review (static)
- Privacy-notice dialog (`anti-cheat-monitor.tsx:322-357`): modal with
  `disablePointerDismissal`, no close button, single accept action — correct
  forced-consent pattern; Radix dialog provides the focus trap and
  `aria-describedby` via `DialogDescription`. Icon is `aria-hidden`. OK.
- `ExamDeadlineSync` extension note (`exam-deadline-sync.tsx:107`):
  `role="status"` (polite) + toast — DES3-1 (assertive vs polite on
  expired→active transitions) remains deferred per its register row; no
  regression.
- Countdown + extension flow only ever moves deadlines later client-side;
  no anxiety-inducing backwards jumps possible (`:70` guard). Good.

## DES4-2 — Instructor-facing consequence of AGG4-1 (MEDIUM as UX, High confidence)
The anti-cheat dashboard's escalate tier is the instructor's primary triage
surface; today it renders false `submission_stale_heartbeat` entries for every
participant's first problem open (see code-reviewer CR4-1). From a UX
standpoint this trains operators to ignore the highest tier — the classic
alarm-fatigue failure. The fix is backend (flag only on submit), no dashboard
change needed; after it lands the tier becomes meaningful again.

## DES4-3 — Korean typography rule compliance: PASS
All `tracking-*` sites in `src/components` re-checked: every one is
locale-gated (`locale !== "ko"`) or scoped to alphanumeric/mono content
(access codes), matching CLAUDE.md's rule. No custom letter-spacing reaches
Korean text. Examples verified: `public-header.tsx:305-306`,
`public-problem-set-list.tsx:35`, `discussion-*.tsx`,
`access-code-manager.tsx:153`.

## DES4-4 — Minor notes (LOW, static-only, needs browser validation)
- Contest list status labels show "closed" at the assignment close even for a
  participant holding a staff extension (see tracer Trace 3); their own exam
  page shows the live personal countdown, so the mixed signal is brief but
  could confuse during accommodations. Needs a product/UX decision —
  recommended to bundle with the carried TA3-1-followup timeline work rather
  than patch ad hoc.
- `toast.warning(resolvedWarningMessage)` on tab return (monitor `:234`) fires
  AFTER the grace period from the hidden tab — the toast appears on the exam
  tab when the student returns; message wording (default `warningTabSwitch`)
  reads as a warning, not an accusation. Reasonable as-is.

## Exit criteria for the deferred browser audit
DES-ENV (carried): a provisioned staging server + browser would unlock the
WCAG 2.2 contrast/focus audit, reduced-motion check, and LCP/CLS/INP
measurement that static review cannot provide.
