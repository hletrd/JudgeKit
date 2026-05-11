# UI/UX Review: JudgeKit

**Reviewer:** designer
**Date:** 2026-05-11
**Scope:** Accessibility, responsive design, form UX, loading states — Cycle 2 of RPF loop

---

## New Findings Summary

| Severity | Count |
|----------|-------|
| MEDIUM   | 1     |
| LOW      | 2     |
| **Total**| **3** |

---

## MEDIUM

### UI1: Verify-Email Page Lacks Loading Spinner / Visual Feedback During Fetch
- **File:** `src/app/(auth)/verify-email/page.tsx:63-65`
- **Confidence:** High
- **Description:** The loading state displays only static text (`t("verifying")`) with no spinner, progress indicator, or skeleton. On slower networks, users may perceive the page as frozen. Contrast this with other auth flows (signup, login) which use button loading states and inline spinners.
- **Failure scenario:** User on slow mobile connection sees "Verifying..." text with no animation. They assume the page is broken and refresh, potentially causing duplicate verification requests.
- **Fix:** Add a `<Loader2 className="animate-spin" />` spinner icon next to the text, matching the pattern used in `src/components/code/compiler-client.tsx` and other async UI surfaces.

---

## LOW

### UI2: Verify-Email CardTitle Wraps `<h1>` Creating Potential Heading Nesting
- **File:** `src/app/(auth)/verify-email/page.tsx:58-60`
- **Confidence:** Medium
- **Description:** `<CardTitle>` from shadcn/ui typically renders as an `<h3>` or similar heading element. Wrapping an `<h1>` inside it creates invalid heading hierarchy (h1 inside h3), which breaks accessibility for screen reader users navigating by heading level.
- **Failure scenario:** Screen reader user navigates to the page and encounters an h1 nested inside a lower-level heading. The heading structure is nonsensical and confusing.
- **Fix:** Remove the nested `<h1>` and rely on `<CardTitle>`'s native heading, or use `<CardTitle asChild>` with the `<h1>` as the only heading element.

### UI3: Verify-Email Success/Error Buttons Not Disabled During Processing
- **File:** `src/app/(auth)/verify-email/page.tsx:71-76,85-90`
- **Confidence:** Low
- **Description:** The "Sign In" and "Back to Sign In" buttons are always interactive, even while verification is in flight. There is no visual or interaction difference between loading and final states until the status changes.
- **Fix:** Add `disabled={status === "loading"}` to both buttons, or hide them entirely during loading.

---

## Accessibility Sweep

- `role="status"` and `role="alert"` used correctly for dynamic content
- Color contrast: green-600 on white passes WCAG AA (3:1 for large text, but this is small text — needs verification)
- Focus management: no focus trap, no autofocus on error message
- Keyboard navigation: buttons are native and focusable
- Missing: skip link, landmark regions (aside, nav), live region for loading state
