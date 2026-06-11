# Designer — UI/UX Review (SMTP settings) — Cycle 1 (2026-05-29)

NOTE: a prior `designer.md` in this directory (dated 2026-05-12) covers menu/IA and is
preserved for provenance. This file is the cycle-1 (2026-05-29) review of the SMTP
settings UI added this cycle.

Scope: `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:349-376`.
Admin-only configuration UI; a full browser-driven WCAG pass was not warranted for the
small change surface. Reviewed via source (labels, associations, input types).

## Findings

### UX-C1-1 — SMTP port input is free-text, not numeric [Low / Medium confidence]
`form.tsx:358`: `<Input id="smtp-port" ...>` lacks `type="number"` / `inputMode="numeric"`.
Coerced via `Number(smtpPort)` on submit (line 166); Zod rejects out-of-range. Gives no
mobile numeric keypad and no inline hint that 1-65535 is the valid range.
Fix: add `inputMode="numeric"` and surface the field-level validation error.

### UX-C1-2 — Masked password placeholder risks accidental credential clearing [Low / Low confidence]
Password input is pre-filled `••••••••` (page.tsx:135). Submit only skips the write when
the field still equals the placeholder (form.tsx:169). A user who clears the field
intending "leave unchanged" would instead clear stored SMTP auth.
Fix: a "Change password" reveal toggle with an empty field would make intent explicit.

## Confirmed-acceptable
- All SMTP inputs have associated `<Label htmlFor=...>` (lines 353-374) — proper SR
  label association.
- Password field is `type="password"` (line 366).
- Korean labels use default letter spacing (no tracking utilities) — CLAUDE.md compliant.
- "Implicit TLS" checkbox is keyboard-reachable with an adjacent label.
