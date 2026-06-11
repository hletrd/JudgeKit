# Security Review — Cycle 20

**Date:** 2026-05-09
**Reviewer:** security-reviewer
**Scope:** Full repository

---

## Findings

### C20-1: [MEDIUM] useKeyboardShortcuts can hijack browser shortcuts

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/hooks/use-keyboard-shortcuts.ts:30`
- **Category:** UX Security / Input Handling

**Problem:**
The hook fires handlers on `e.key` alone without checking modifier keys. A shortcut registered for `"s"` will fire on `Ctrl+s`, preventing the browser's native Save shortcut from working. This is a UX security issue because it can unexpectedly trigger application actions when the user intends to use browser functionality.

**Fix:**
Require explicit modifier matching in the shortcut key format.

---

### C20-2: [LOW] LocaleSwitcher Secure cookie breaks HTTP dev but falls back safely

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/layout/locale-switcher.tsx:44`
- **Category:** Defense-in-depth

**Problem:**
The unconditional `Secure` flag on the locale cookie causes it to be rejected on HTTP development environments. The catch block silently falls through to a reload, but since the cookie was never set, the locale change is lost. While not a security vulnerability per se, it weakens the defense-in-depth of locale isolation in development.

**Fix:**
Conditionally set `Secure` based on `window.location.protocol`.

---

### C20-3: [MEDIUM] useUnsavedChangesGuard history patch leak

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/hooks/use-unsaved-changes-guard.ts:245-264`
- **Category:** State Management / DOM Integrity

**Problem:**
Multiple instances of this hook can leave `window.history.pushState` permanently patched even after all instances unmount. This creates a persistent mutation of global browser state that could interfere with client-side routing libraries and cause unexpected `window.confirm` dialogs.

**Fix:**
Use a shared singleton to track active guard instances and only restore originals when the last instance unmounts.

---

## Verified Security Posture

- CSRF protection: `validateCsrf` in `src/lib/security/csrf.ts` correctly checks `X-Requested-With`, `Sec-Fetch-Site`, and Origin headers.
- Auth: `getApiUser` in `src/lib/api/auth.ts` properly validates JWT tokens and checks `tokenInvalidatedAt`.
- Rate limiting: DB-backed with `SELECT FOR UPDATE` — no TOCTOU races.
- Password hashing: Argon2id with timing-safe comparison.
- File uploads: Magic-byte verification, ZIP bomb protection, image processing with Sharp.
- Plugin secrets: AES-256-GCM encryption with HKDF-derived keys.
- Judge worker auth: Per-worker secret tokens with hash comparison.
- Audit events: Buffered batch inserts with overflow protection.

## No New Vulnerabilities

No OWASP Top 10 issues found. All API routes maintain proper auth/authz boundaries.
