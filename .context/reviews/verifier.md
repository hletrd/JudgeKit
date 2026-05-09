# Verifier — Cycle 25

Reviewer: verifier
Date: 2026-05-09
Scope: Evidence-based correctness check against stated behavior
Base commit: 75d82a17

## Summary

All prior fixes verified as resolved. Three new findings confirmed by code inspection.

---

## Prior Fixes Verified

### VR-P1: apiFetch timeout bypass (C16 CR-1)
- **Status**: FIXED
- **Evidence**: `src/lib/api/client.ts:90-92` now uses `withTimeout(init.signal, 30_000)` when caller provides signal, and `createTimeoutSignal(30_000)` when no signal is provided. Both paths enforce the 30s timeout.

### VR-P2: AbortSignal.timeout browser fallback (C16 CR-2)
- **Status**: FIXED
- **Evidence**: `src/lib/abort.ts:6-13` implements `createTimeoutSignal` with `typeof AbortSignal?.timeout === "function"` check and setTimeout fallback.

### VR-P3: useKeyboardShortcuts modifier key handling (C19-1)
- **Status**: FIXED
- **Evidence**: `src/hooks/use-keyboard-shortcuts.ts:8-20` builds modifier-aware shortcut keys (`Ctrl+k`, `Alt+p`, etc.). Plain keys like `"n"` only match when no modifiers are pressed.

### VR-P4: Chat widget hanging (C16 DB-1)
- **Status**: FIXED
- **Evidence**: `apiFetch` now applies timeout to all requests via `withTimeout`, so chat widget requests cannot hang indefinitely.

### VR-P5: File upload hanging (C16 DB-2)
- **Status**: FIXED
- **Evidence**: Same as VR-P4 — all `apiFetch` calls get timeout.

---

## New Findings Verified

### VR-25-1: `poll/route.ts` uses inconsistent transaction wrappers

- **File**: `src/app/api/v1/judge/poll/route.ts:77,136`
- **Confidence**: High
- **Evidence**: Line 77 reads `await execTransaction(async (tx) => { ... })`. Line 136 reads `await db.transaction(async (tx) => { ... })`. Confirmed by direct inspection.

### VR-25-2: `getStaleImages` has unbounded concurrency

- **File**: `src/app/api/v1/admin/docker/images/route.ts:16-38`
- **Confidence**: High
- **Evidence**: `await Promise.all(images.map(async (img) => { ... }))` has no concurrency limit. With 100+ images, this spawns 200+ concurrent operations.

### VR-25-3: Trusted registry prefix lacks boundary check

- **File**: `src/lib/judge/docker-image-validation.ts:1-3`
- **Confidence**: High
- **Evidence**: `isTrustedRegistryImage` uses `trustedRegistries.some((prefix) => image.startsWith(prefix))` without checking the character after the prefix. A registry `registry.io` would match `registry.io.evil.com/judge-cpp`.

---

## No Other Verified Issues

All auth checks, rate limits, and transaction boundaries behave as documented.
