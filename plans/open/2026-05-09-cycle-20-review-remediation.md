# Cycle 20 Review Remediation Plan

**Date:** 2026-05-09
**Based on:** `.context/reviews/_aggregate-cycle-20.md`
**HEAD:** 75d82a17
**Review base:** 75d82a17

---

## Active Tasks

### C20-1: Fix useKeyboardShortcuts modifier-key handling

- **File:** `src/hooks/use-keyboard-shortcuts.ts`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer, security-reviewer, test-engineer

**Problem:**
The hook matches shortcuts solely on `e.key` without considering modifier keys. A shortcut for `"s"` fires on `Ctrl+s`, interfering with browser shortcuts.

**Fix:**
Include modifier state in the shortcut lookup key. Change the shortcut map format to support modifiers (e.g., `"Ctrl+s"`, `"s"` for plain key).

**Implementation:**
- [x] Update `useKeyboardShortcuts` to build a composite key including modifiers
- [x] Update all callers to use the new key format if they register shortcuts with modifiers
- [x] Add unit test for modifier-key behavior

**Notes:**
- Plain keys like `"n"` only match when NO modifiers are pressed.
- Modifier combos like `"Ctrl+s"` explicitly match with those modifiers.
- Modifier keys by themselves (Control, Alt, Shift, Meta) are ignored as shortcuts.
- Test file moved to `tests/component/` since `renderHook` requires jsdom.

---

### C20-2: Fix LocaleSwitcher Secure cookie on HTTP dev

- **File:** `src/components/layout/locale-switcher.tsx`
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer, security-reviewer

**Problem:**
The locale cookie is set with `Secure` unconditionally. On HTTP development environments, browsers reject the cookie, causing locale changes to silently fail.

**Fix:**
Conditionally set `Secure` based on `window.location.protocol === 'https:'`.

**Implementation:**
- [x] Update `setLocale` in `locale-switcher.tsx` to conditionally set Secure
- [x] Verify existing locale-switcher test still passes

**Status:** Completed in commit 206b3cd5.

---

### C20-3: Fix useUnsavedChangesGuard history patch leak

- **File:** `src/hooks/use-unsaved-changes-guard.ts`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer, security-reviewer, architect

**Problem:**
Multiple components using this hook both patch `window.history.pushState`. After unmounting, the history methods remain patched because each instance saves the other's patched version as "original".

**Fix:**
Use a shared global singleton to track active guard instances and only restore originals when the last instance unmounts.

**Implementation:**
- [x] Add module-level state to track original history methods and active instance count
- [x] Modify mount/unmount logic to use shared singleton
- [x] Verify no regressions in existing behavior

**Notes:**
- Uses a guard stack so the shared patch always delegates to the most recently mounted instance.
- Only restores true originals when the last instance unmounts.
- Lazy-captures originals to avoid `window is not defined` errors in Node test environments.

---

## Deferred Items

None. All findings from this cycle are scheduled for implementation.

---

## Gate Results

- [x] `npx eslint .` passes
- [x] `npx tsc --noEmit` passes
- [x] `npx next build` passes (Turbopack warning on `process.exit` in Edge instrumentation is pre-existing)
- [x] `npx vitest run` passes — 314 test files, 2352 tests
- [x] `npx vitest run --config vitest.config.component.ts` passes — 67 test files, 189 tests

---

## Implementation Order

1. C20-2 (LocaleSwitcher) — smallest change, lowest risk
2. C20-1 (useKeyboardShortcuts) — medium change, add tests
3. C20-3 (useUnsavedChangesGuard) — most complex, verify carefully

---

## Deploy Results

All fixes implemented and gates passed.
