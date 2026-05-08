# Aggregate Review — Cycle 33

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer
**Total findings:** 3 new (1 MEDIUM, 2 LOW) + 16 carried deferred re-validated + 0 newly fixed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] Chat widget "Test Connection" button incorrectly disabled when API key is stored server-side but local state is empty

**Sources:** NEW-1 | **Confidence:** HIGH

In `src/lib/plugins/chat-widget/admin-config.tsx:238`, the "Test Connection" button has `disabled={isTesting || !currentApiKey}`. When a previously-saved API key exists server-side, the component correctly shows "Key: Configured" but the `currentApiKey` local state remains empty (server never returns stored keys). This disables the Test Connection button even though the server has a valid key. The test-connection endpoint doesn't require the client to send the key — it uses the server-stored key.

**Fix:** Change `disabled={isTesting || !currentApiKey}` to `disabled={isTesting || (!currentApiKey && !currentApiKeyConfigured)}`.

---

### AGG-2: [LOW] Contest replay `useLayoutEffect` causes SSR warning

**Sources:** NEW-2 | **Confidence:** MEDIUM

`src/components/contest/contest-replay.tsx:111` uses `useLayoutEffect` which triggers a React SSR warning. Since the component is `"use client"`, this is a build-log-only concern. Standard fix: use an isomorphic layout effect hook.

**Fix:** Optional. Replace with `useIsomorphicLayoutEffect`.

---

### AGG-3: [LOW] `parseInt` with `||` fallback treats `0` as falsy in chat widget admin config

**Sources:** NEW-3 | **Confidence:** LOW

`src/lib/plugins/chat-widget/admin-config.tsx:295,306` uses `parseInt(...) || fallback`. The `||` operator treats `0` as falsy. Since the inputs have `min` attributes preventing `0`, this is effectively a non-issue but is stylistically inconsistent.

**Fix:** Optional. Use `??` instead of `||`.

---

## Carried Deferred Items (unchanged)

- DEFER-22: `.json()` before `response.ok` — 60+ instances
- DEFER-23: Raw API error strings without translation — partially fixed
- DEFER-24: `migrate/import` unsafe casts — Zod validation not yet built
- DEFER-25: `LectureModeContext` value instability — FIXED
- DEFER-27: Missing AbortController on polling fetches
- DEFER-28: `as { error?: string }` pattern — 22+ instances
- DEFER-29: Admin routes bypass `createApiHandler`
- DEFER-30: Recruiting validate token brute-force
- DEFER-31: files/[id] explicit select — FIXED
- DEFER-32: Admin settings exposes DB host/port
- DEFER-33: Missing error boundaries
- DEFER-34: Hardcoded English fallback strings
- DEFER-35: Hardcoded English strings in editor title attributes
- DEFER-36: `formData.get()` cast assertions
- DEFER-43: Docker client leaks `err.message` in build responses
- DEFER-44: No documentation for timer pattern convention
- DEFER-45: Anti-cheat monitor captures user text snippets (design decision)

## No Agent Failures

The comprehensive review completed successfully.
