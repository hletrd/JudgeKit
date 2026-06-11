# Designer (UI/UX) — Cycle 2 (2026-05-29)

The repo has a Next.js web frontend. The cycle-1 UI surface was the admin SMTP
config in `system-settings-form.tsx` (already reviewed in cycle-1's
`designer-smtp-ui.md`, which flagged UX-C1-1 numeric input-mode and UX-C1-2
masked-field clear — both OPEN/Low). This review looks for net-new UI/UX issues
on that surface only.

Multimodal caveat: review is text/DOM-based (no reliance on screenshots).

## DSN-C2-1 — Recruiting bulk import gives no email feedback (UX side of DBG-C2-2) — Low / High
Because the bulk-create route never sends invitation emails (DBG-C2-2) while the
single-create flow does, the recruiter's mental model breaks: the bulk UI offers
no "emails sent: N" confirmation and no "this import will NOT email candidates"
warning. The information-architecture fix is to make the email behavior explicit
in the bulk dialog (either "Send invitation emails" checkbox wired to a real
send, or a clearly-worded note that bulk import does not email). Net-new (UX
consequence of the behavioral gap).

## Korean typography compliance
Confirmed: `system-settings-form.tsx` applies NO custom `letter-spacing` /
`tracking-*` utilities (grep clean). Compliant with CLAUDE.md Korean
letter-spacing rule. No action.

## Accessibility / states (spot check)
- SMTP password field is masked; cycle-1 UX-C1-2 (accidental clear) remains the
  open item — not re-counted.
- No net-new contrast/ARIA/focus regressions identified in the cycle-1 form
  diff. The form follows the existing settings-form patterns (shared field
  components), so accessibility parity with the rest of the settings page holds.

No High/Critical UI findings net-new this cycle.
