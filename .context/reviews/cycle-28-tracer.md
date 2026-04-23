# Cycle 28 Tracer Review

**Date:** 2026-04-20
**Reviewer:** tracer
**Base commit:** d4489054

## Traced Flows

### Flow 1: Language change in compiler-client

1. User selects language in `LanguageSelector` -> `handleLanguageChange(newLang)` called
2. `setLanguage(newLang)` updates state
3. React re-renders, triggering the `useEffect` at line 182
4. `localStorage.setItem("compiler:language", language)` executes
5. **FAILURE POINT**: In Safari private browsing, this throws `QuotaExceededError`
6. React error boundary catches the error, showing fallback UI
7. User loses access to the playground

**Root cause**: Missing try/catch on localStorage write. All other localStorage operations in the codebase handle this.
**Fix confidence**: HIGH — trivial try/catch wrapper.

### Flow 2: Resubmit from submission detail

1. User clicks "Resubmit" button -> `handleResubmit()` called
2. `localStorage.setItem(key, JSON.stringify(payload))` at line 94
3. **FAILURE POINT**: Same as Flow 1 — throws in private browsing
4. `router.push(problemHref)` at line 95 never executes
5. User is stuck on the submission detail page

**Root cause**: Missing try/catch. The navigation should happen regardless of draft save success.
**Fix confidence**: HIGH — wrap in try/catch, ensure `router.push()` always executes.

### Flow 3: Contest clarifications display

1. User views clarifications in a contest
2. Component renders `{clarification.userId === currentUserId ? t("askedByMe") : clarification.userId}`
3. For other users' clarifications, raw `userId` (UUID) is displayed
4. User cannot identify who asked the question

**Root cause**: API response does not include `userName` field for clarifications. Frontend only has `userId` available.
**Fix confidence**: MEDIUM — requires backend API change to include user names.
