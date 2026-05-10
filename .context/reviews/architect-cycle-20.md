# Architect Review — Cycle 20

**Date:** 2026-05-09
**Reviewer:** architect
**Scope:** Full repository

---

## Findings

### C20-1: [MEDIUM] useUnsavedChangesGuard breaks global browser contract

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/hooks/use-unsaved-changes-guard.ts`

**Problem:**
The hook monkey-patches `window.history.pushState` and `window.history.replaceState` — fundamental browser APIs that Next.js App Router depends on. This is architecturally risky:

1. **Fragility:** Next.js internals may change how they interact with these methods, causing silent breakage on upgrades.
2. **Composability:** Multiple instances create a layering violation where components interfere with each other's state.
3. **Testability:** Global side effects make unit testing difficult and can leak between tests.

The hook itself acknowledges this risk in its docstring: "This is a known fragile pattern — it may conflict with Next.js App Router internals."

**Recommended Path Forward:**
Replace with Next.js App Router's navigation events API when stable, or use a context-based router wrapper that intercepts navigation via `<Link>` and `useRouter` instead of patching globals.

---

### C20-2: [LOW] Keyboard shortcut registry is global and flat

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/hooks/use-keyboard-shortcuts.ts`

**Problem:**
The shortcut map is a flat record keyed by `e.key`. This design:
1. Cannot support modifier-key combinations (Ctrl, Alt, etc.).
2. Cannot support key sequences (e.g., `g` then `p` for "go to problems").
3. Has no scoping — shortcuts are global regardless of which component registers them.
4. Does not handle focus context (e.g., different shortcuts when a modal is open).

**Fix (Short-term):**
Add modifier key support to the existing hook.

**Fix (Long-term):**
Consider a hierarchical shortcut registry with focus scopes, similar to how React context works. This would allow modals and nested components to shadow parent shortcuts.

---

## Architectural Health

- **API Layer:** `createApiHandler` provides consistent middleware stacking (auth, CSRF, rate limit, validation, error handling). Good separation of concerns.
- **DB Layer:** Drizzle ORM with transaction wrapper. Raw SQL is isolated to specific files with proper parameterization.
- **Auth Layer:** JWT with DB-backed token invalidation. Capabilities system decouples auth from roles.
- **Judge Layer:** Clean separation between claim/poll/heartbeat/deregister. Raw SQL for atomic claims is justified and well-documented.
- **Real-time Layer:** SSE with shared polling fallback. Connection tracking with eviction.

## No Structural Risks

No new coupling issues or layering violations detected.
