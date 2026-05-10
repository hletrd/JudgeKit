# Code Review — Cycle 20

**Date:** 2026-05-09
**Reviewer:** code-reviewer
**Scope:** Full repository

---

## Findings

### C20-1: [MEDIUM] useKeyboardShortcuts fires on unintended modifier-key combinations

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/hooks/use-keyboard-shortcuts.ts:30`

**Problem:**
The hook matches shortcuts solely on `e.key` without considering modifier keys:

```typescript
const handler = shortcutsRef.current[e.key];
if (handler) {
  e.preventDefault();
  handler();
}
```

This creates two problems:
1. A shortcut registered for `"s"` fires when the user presses `Ctrl+s`, interfering with the browser's Save shortcut.
2. There is no way to register shortcuts that REQUIRE modifier keys (e.g., `Ctrl+k` for a command palette).

**Concrete Failure Scenario:**
A user is editing code in the problem submission view. They press `Ctrl+s` to save their file (muscle memory from their editor). If any component on the page has registered a shortcut for `"s"`, it fires unexpectedly and may trigger navigation or submission.

**Fix:**
Include modifier state in the shortcut lookup key. Use a format like `"Ctrl+s"` or `"s"` (for plain key) so modifiers are explicit:

```typescript
function getShortcutKey(e: KeyboardEvent): string {
  const modifiers = [
    e.ctrlKey ? "Ctrl" : "",
    e.altKey ? "Alt" : "",
    e.shiftKey ? "Shift" : "",
    e.metaKey ? "Meta" : "",
  ].filter(Boolean).join("+");
  return modifiers ? `${modifiers}+${e.key}` : e.key;
}
```

---

### C20-2: [LOW] LocaleSwitcher unconditionally sets Secure cookie flag

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/layout/locale-switcher.tsx:44`

**Problem:**
The locale cookie is set with `Secure` unconditionally:

```typescript
document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Path=/; SameSite=Lax; Secure; Max-Age=${60 * 60 * 24 * 365}`;
```

On HTTP development environments (`http://localhost`), modern browsers reject cookies with the `Secure` flag. The `try/catch` silently swallows the error, and the page reloads. Since the cookie was never set, the server falls back to `Accept-Language` or the existing cookie, and the locale change appears to silently fail.

**Fix:**
Conditionally set `Secure` based on the current protocol:

```typescript
const secure = window.location.protocol === "https:" ? "; Secure" : "";
document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Path=/; SameSite=Lax${secure}; Max-Age=${60 * 60 * 24 * 365}`;
```

---

### C20-3: [MEDIUM] useUnsavedChangesGuard history patches conflict with multiple instances

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/hooks/use-unsaved-changes-guard.ts:245-264`

**Problem:**
The hook monkey-patches `window.history.pushState` and `window.history.replaceState` directly. When multiple components both use this hook:

1. Component A mounts, saves the original `pushState`, and patches it.
2. Component B mounts, saves A's PATCHED `pushState` as "original", and patches it again.
3. Component A unmounts and restores what it thought was original — but it's actually A's patched version.
4. After both unmount, `window.history.pushState` remains patched.

**Concrete Failure Scenario:**
A user has both the problem editor and an assignment editor open in different tabs or as nested routes. Both use `useUnsavedChangesGuard`. After navigating away from both, the history methods remain patched, causing `window.confirm` dialogs to appear on unrelated navigation.

**Fix:**
Use a shared global singleton to manage history patches so only one patch exists regardless of how many components use the hook:

```typescript
// Global singleton guard
let _originalPushState: typeof window.history.pushState | null = null;
let _originalReplaceState: typeof window.history.replaceState | null = null;
let _guardCount = 0;

function installHistoryPatches(confirmNavigation: (url?: string | URL | null) => boolean) {
  if (_guardCount === 0) {
    _originalPushState = window.history.pushState.bind(window.history);
    _originalReplaceState = window.history.replaceState.bind(window.history);
    // ... patch logic here ...
  }
  _guardCount++;
}

function uninstallHistoryPatches() {
  _guardCount--;
  if (_guardCount <= 0 && _originalPushState) {
    window.history.pushState = _originalPushState;
    window.history.replaceState = _originalReplaceState;
    _originalPushState = null;
    _originalReplaceState = null;
  }
}
```

---

## Commonly Missed Checks

- Timer leaks: All reviewed hooks correctly clean up timers and intervals.
- AbortController leaks: Properly handled in submission polling and apiFetch.
- Type safety: No new `any` regressions found.
- Race conditions: Rate-limit atomicity is correct. DB transactions use proper locking.

## No Findings

- No new logic bugs in API routes.
- No new security vulnerabilities.
- No new performance regressions.
