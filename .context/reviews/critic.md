# Critic Review — Cycle 33

**Reviewer:** critic
**Date:** 2026-05-10
**Scope:** Multi-perspective critique of client-side code patterns

---

## Findings

### C33-CT-1: [MEDIUM] throw-then-match anti-pattern persists despite explicit documentation against it

**Files:** Multiple client components
**Confidence:** HIGH

The `src/lib/api/client.ts` file contains extensive documentation (lines 24-73) explaining why the throw-then-match pattern is dangerous and providing the correct pattern. Yet 20+ components still use `throw new Error(data.error ?? "...")` immediately after `.json()`.

This is a process/code-culture issue: documentation alone is insufficient when the anti-pattern is easier to write than the correct pattern.

**Fix:** Consider an ESLint rule or a wrapper that makes the correct pattern the path of least resistance.

---

### C33-CT-2: [LOW] Error boundaries log to console unconditionally

**Files:** `src/app/*/error.tsx` (4 files)
**Confidence:** MEDIUM

Error boundaries in production should not log to console.error. These are user-facing error UI components, not debugging tools. The digest hash leaked to console could expose internal routing or implementation details.

**Fix:** Gate all error boundary console.error behind NODE_ENV check.

---

### C33-CT-3: [LOW] apiFetchJson type narrowing is awkward

**File:** `src/lib/api/client.ts`
**Confidence:** LOW

The `{ ok: true; data: T } | { ok: false; data: T }` return type forces callers to destructure then check `ok`, but `data` is available in both branches. This is confusing — why return data on error?

The design intent (providing parsed error body) is reasonable, but the ergonomics could be improved with a result type or optional chaining.

**Fix:** Consider `Result<T, ErrorInfo>` pattern or at least document why data is returned on error.

---

## Cross-Agent Agreement

- Timer leak in submission-list-auto-refresh: confirmed by code-reviewer, debugger, verifier
- apiFetchJson fetch error handling: confirmed by code-reviewer, security-reviewer, verifier
- Error boundary console.error: confirmed by security-reviewer, critic
