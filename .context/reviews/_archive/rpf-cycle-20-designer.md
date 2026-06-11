# RPF Cycle 20 — Designer

**Date:** 2026-04-22
**Base commit:** 4182e529

## Findings

### DES-1: `create-group-dialog.tsx` — No error boundary for JSON parse failure leaves user stuck [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx:74-83`

**Description:** If `response.json()` throws SyntaxError on a 200 response, the catch block shows an error toast and the dialog remains open. However, the group may have actually been created on the server. The user has no way to navigate to the newly created group and may try to create it again, resulting in a duplicate. This is a UX concern rather than a visual design issue.

**Fix:** After the error toast, navigate to the groups list page so the user can find the group, or check if the group exists before showing the error.

---

### DES-2: `admin-config.tsx` — Test connection result not announced to screen readers [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:240-243`

**Description:** The test connection result is displayed as a `<span>` element with no `role` or `aria-live` attribute. Screen readers would not announce the result when it changes. This is a minor accessibility issue for admin users.

**Fix:** Add `role="status"` and `aria-live="polite"` to the result container.

---

## Verified Safe (No Issue Found)

- Korean letter-spacing compliance maintained — `tracking-[0.35em]` on access code input is annotated as safe for Korean locale (font-mono alphanumeric)
- All form inputs have associated `<Label>` elements
- Dialog components use proper `DialogDescription` for accessibility
- Loading states properly disable interactive elements
- Color contrast meets WCAG requirements for status indicators
- Error states use `text-destructive` and `role="alert"` patterns
