# Test Engineer Review — Cycle 20

**Date:** 2026-05-09
**Reviewer:** test-engineer
**Scope:** Full repository

---

## Findings

### C20-1: [MEDIUM] Missing test for modifier-key handling in useKeyboardShortcuts

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/hooks/use-keyboard-shortcuts.ts`

**Problem:**
The `useKeyboardShortcuts` hook has no unit tests. Given that it directly patches `document.addEventListener("keydown", ...)`, testing it requires careful mocking of `KeyboardEvent`. The lack of tests means the modifier-key bug (firing on `Ctrl+s` when registered for `s`) has no regression protection.

**Fix:**
Add a component test that:
1. Renders a component with `useKeyboardShortcuts({ s: mockHandler })`
2. Dispatches a `KeyboardEvent` with `key: "s"` and `ctrlKey: true`
3. Asserts that `mockHandler` is NOT called
4. Dispatches a plain `KeyboardEvent` with `key: "s"`
5. Asserts that `mockHandler` IS called

---

### C20-2: [LOW] Missing test for LocaleSwitcher cookie Secure flag

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/layout/locale-switcher.tsx`

**Problem:**
The locale switcher component test exists (`tests/component/locale-switcher.test.tsx`) but only asserts that the dropdown renders and that selecting a locale triggers `window.location.reload`. It does not assert the cookie string format or the `Secure` flag behavior.

**Fix:**
Extend the existing test to mock `document.cookie` and assert that the `Secure` flag is only present when `window.location.protocol === 'https:'`.

---

## Coverage Analysis

| Area | Status |
|------|--------|
| Unit tests | 314 files, 2352 tests passing |
| Component tests | 66 files, 179 tests passing |
| Security tests | Covered (timing, password, CSRF) |
| Integration tests | Passing |

## Test Gaps

- `useKeyboardShortcuts`: No tests at all.
- `useUnsavedChangesGuard`: No tests at all (understandable given its global side effects, but could be tested with careful cleanup).
- `useSourceDraft`: Complex hook with localStorage interactions — could benefit from more edge-case tests (quota exceeded, corrupted data, rapid language switches).

## No Flaky Tests

All gates pass consistently. No new flaky patterns detected.
