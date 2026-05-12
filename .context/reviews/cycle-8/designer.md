# UI/UX Review — Cycle 8/100

**Date:** 2026-05-11
**HEAD:** main / 05752cdb
**Reviewer:** designer

---

## Findings

### UX1 — LOW — Verify-email page has redundant `redirect` in useEffect deps

- **File:** `src/app/(auth)/verify-email/page.tsx:61`
- **Description:** The `useEffect` dependency array includes `redirect`, but `redirect` is not used inside the effect. This is a minor code hygiene issue that does not affect UX.
- **Confidence:** HIGH

### UX2 — LOW — Contest layout workaround forces full page navigation

- **Files:** `src/app/(public)/contests/manage/layout.tsx`, `src/app/(public)/contests/[id]/layout.tsx`
- **Description:** The workaround for the Next.js RSC streaming bug intercepts clicks on links with `data-full-navigate` and forces `window.location.href = href`. This causes a full page reload instead of client-side navigation, which is perceptibly slower for users. The impact is limited to contest pages with `data-full-navigate` links.
- **Confidence:** HIGH
- **Suggested fix:** Remove workaround when upstream Next.js issue #76472 is fixed.

### UX3 — LOW — Group dialogs use `toast.error` with raw API error keys

- **Files:** `src/app/(public)/groups/create-group-dialog.tsx:72`, `src/app/(public)/groups/edit-group-dialog.tsx` (similar)
- **Description:** Error messages from API responses are passed directly to `toast.error(t(getApiError(data) || "createError"))`. If the API returns an unmapped error key, the user sees an untranslated string.
- **Confidence:** LOW
- **Suggested fix:** Ensure all API error keys have corresponding i18n translations.

---

## Accessibility Notes

- Verify-email page uses `role="status"` for success message and `role="alert"` for error message. Good practice.
- No new accessibility regressions detected in reviewed files.
