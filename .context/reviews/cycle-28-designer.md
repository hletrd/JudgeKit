# Cycle 28 Designer Review (UI/UX)

**Date:** 2026-04-20
**Reviewer:** designer
**Base commit:** d4489054

## Findings

### DES-1: `compiler-client.tsx` hardcoded English strings with `defaultValue` [LOW/LOW]

**File:** `src/components/code/compiler-client.tsx` (multiple lines)
**Problem:** The compiler client uses `t("key", { defaultValue: "English fallback" })` on all translation calls. This pattern is not used anywhere else in the codebase and suggests the `compiler.*` i18n namespace may be incomplete for non-English locales. If a translation key is missing, the user sees English text instead of their preferred language.

**Concrete failure scenario:** Korean user opens the playground and sees "Already running." or "Network error" in English because those keys are missing from the Korean translation file.
**Fix:** Verify all `compiler.*` keys exist in both `en.json` and `ko.json` locale files. Remove the `defaultValue` parameters if the keys are properly registered.

### DES-2: `contest-clarifications.tsx` clarifications show `userId` instead of username for other users [LOW/MEDIUM]

**File:** `src/components/contest/contest-clarifications.tsx:257`
**Code:** `{clarification.userId === currentUserId ? t("askedByMe") : clarification.userId}`
**Problem:** When the clarification was not asked by the current user, the component displays the raw `userId` (a UUID or internal ID) instead of a human-readable username. This is a UX issue — users cannot identify who asked a question.
**Concrete failure scenario:** In a contest with 100 participants, the clarifications panel shows 99 UUIDs instead of names. Participants cannot tell which clarifications are theirs.
**Fix:** The API response should include `userName` alongside `userId`, or the component should look up the name from a user map. This requires a backend change to include user names in the clarifications API response.

## Verified Safe / No Issue

- Korean letter-spacing compliance is thorough — all headings and labels use locale-conditional tracking.
- PublicHeader mobile menu has proper focus trap (Tab/Shift+Tab wrapping) and Escape to close.
- Screen reader announcements for menu state (`aria-live="polite"`).
- All interactive elements have proper `aria-label`, `aria-expanded`, `aria-controls`.
- Sidebar admin section has locale-conditional tracking for uppercase labels.
- Contest layout forced navigation workaround is documented with a TODO.
- Not-found page properly documents the 404 tracking as safe for Korean locale.
