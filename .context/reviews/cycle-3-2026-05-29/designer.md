# designer — Cycle 3 (2026-05-29)

UI/UX angle on the changed surface (admin SMTP settings form, recruiting
invitations panel). Findings are textual/selector-based (model not assumed
multimodal); no live browser run needed for these static, confirmable issues.

## DSN-C3-1 [Low / Medium] — SMTP port field has no numeric input affordance
`system-settings-form.tsx:357-358`:
`<Input id="smtp-port" value={smtpPort} onChange=... placeholder="587" />`.
Free-text input for a numeric-only field. On mobile this surfaces the full
alphanumeric keyboard; it also permits non-digit entry that is only coerced via
`Number(smtpPort)` at submit (`:166`). Add `inputMode="numeric"` (and optionally
`pattern="[0-9]*"`) for the right mobile keypad and clearer affordance.
Carried-over UX-C1-1, OPEN.

## DSN-C3-2 [Low / Medium] — Masked SMTP password field can be silently cleared
`system-settings-form.tsx:365-366` (`type="password"`, placeholder `••••••••`).
Submit logic (`:169`) only sends `smtpPass` when it differs from
`initialSmtpPassMasked`. If an admin focuses the field, clears it intending "no
change", and the cleared value happens to equal the masked sentinel handling, the
behavior around "empty means keep vs. clear" is ambiguous. Document/clarify: an
explicit "clear password" affordance vs. "leave blank to keep current". Low.
Carried-over UX-C1-2, OPEN.

## DSN-C3-3 [Low / High — tied to product decision] — Bulk recruiting import gives no email-status feedback
`recruiting-invitations-panel.tsx` and the bulk route do not send invitation
emails (single-create does). If the product keeps "bulk = no email", the UI should
say so (e.g. "Bulk-imported candidates are NOT emailed automatically — use Copy
Link or the single Invite action to send"). If the product chooses "bulk = email",
the dialog should surface "N emails sent". Today it is silent either way, which is
a discoverability gap. This is the UI half of the deferred F2 (product decision);
remains DEFERRED with F2's exit criterion.

## Confirmed-good
- Recruiting panel has explicit empty-state handling
  (`:532 invitations.length === 0`) and copy-link feedback (`copiedId`).
- SMTP password is correctly `type="password"` (not exposed in DOM as plaintext).

## Accessibility / responsive notes
- Labels are associated via `htmlFor`/`id` on the SMTP inputs (good for SR).
- Korean typography rule respected: no custom `letter-spacing`/`tracking-*` seen
  on the touched form/panel markup.

## Final sweep
No net-new UI defects beyond the two carried-over admin-form polish items and the
DEFERRED bulk-email feedback (F2 UI half). Nothing blocking; all Low.
