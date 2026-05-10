# Aggregate Review — Cycle 20/100

**Date:** 2026-05-09
**HEAD:** 75d82a17
**Agents:** code-reviewer, security-reviewer, perf-reviewer, test-engineer, architect

---

## DEDUPLICATED FINDINGS

### C20-1: [MEDIUM] useKeyboardShortcuts fires on unintended modifier-key combinations

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/hooks/use-keyboard-shortcuts.ts:30`
- **Found by:** code-reviewer, security-reviewer, test-engineer (cross-agent agreement)
- **Summary:** The hook matches shortcuts solely on `e.key` without considering modifier keys (Ctrl, Alt, Shift, Meta). A shortcut registered for `"s"` fires on `Ctrl+s`, interfering with browser shortcuts. There is also no way to register shortcuts that require modifiers.
- **Fix:** Include modifier state in the shortcut lookup key using a format like `"Ctrl+s"`.

### C20-2: [LOW] LocaleSwitcher unconditionally sets Secure cookie flag

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/layout/locale-switcher.tsx:44`
- **Found by:** code-reviewer, security-reviewer
- **Summary:** The locale cookie is set with `Secure` unconditionally. On HTTP development environments, browsers reject the cookie, so the locale change silently fails on reload.
- **Fix:** Conditionally set `Secure` based on `window.location.protocol === 'https:'`.

### C20-3: [MEDIUM] useUnsavedChangesGuard history patches conflict with multiple instances

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/hooks/use-unsaved-changes-guard.ts:245-264`
- **Found by:** code-reviewer, security-reviewer, architect (cross-agent agreement)
- **Summary:** Multiple components using this hook both patch `window.history.pushState`. Component B saves A's patched version as "original", so when A unmounts and restores what it thought was original, it actually restores A's patched version. After both unmount, the history methods remain patched.
- **Fix:** Use a shared global singleton to track active guard instances and only restore originals when the last instance unmounts.

---

## DEFERRED / NO FINDINGS

- useSourceDraft debounce effect runs frequently (perf-reviewer C20-1): LOW severity, correct behavior, optimization only.
- useUnsavedChangesGuard creates new closures on every render (perf-reviewer C20-2): LOW severity, negligible impact.
- Missing tests for useKeyboardShortcuts (test-engineer C20-1): Will be addressed alongside the modifier-key fix.
- Missing tests for LocaleSwitcher cookie (test-engineer C20-2): Will be addressed alongside the Secure flag fix.

## AGENT FAILURES

None. All reviewer agents completed successfully.
