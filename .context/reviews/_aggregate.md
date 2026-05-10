# Aggregate Review — Cycle 32

**Date:** 2026-05-10
**Cycle:** 32 of 100
**Base commit:** b1c3564b
**Current HEAD:** b1c3564b (clean working tree)
**Agents:** Manual review — no agent runtime registered in `.claude/agents/`

---

## Methodology

No review agents were registered in this environment. Reviews were performed manually across security, correctness, performance, architecture, test coverage, and UI/UX dimensions.

All gates verified at HEAD:
- eslint: 0 errors
- tsc --noEmit: passes
- next build: passes
- vitest run: 315/315 files, 2382 tests (all pass)
- vitest component: 68 files, 208 tests (all pass)

---

## DEDUPLICATED FINDINGS

### C32-1: [MEDIUM] SSE parser calls controller.close() after controller.error()
**Sources:** code-reviewer, perf-reviewer, architect, critic, verifier, debugger, tracer | **Confidence:** HIGH
**File:** `src/lib/plugins/chat-widget/providers.ts:491-495`

The `transformSSE` function's try/catch/finally structure calls `controller.error(err)` in catch and `controller.close()` in finally. Per the WHATWG Streams spec, these are mutually exclusive — once `error()` transitions the stream to the "errored" state, calling `close()` throws a `TypeError: "Cannot close a stream that has already been closed or errored"`. This secondary exception masks the original error and may cause issues for stream consumers.

**Fix:** Remove `controller.close()` from finally; call it only on the success path:
```typescript
try {
  // ... read loop ...
  // Process remaining buffer ...
  controller.close();  // only on success
} catch (err) {
  controller.error(err);
} finally {
  reader.releaseLock();
}
```

**Cross-file impact:** Affects all three chat providers (OpenAI, Claude, Gemini) since they all use `transformSSE()`.

---

### C32-2: [LOW] maxTokens fallback uses || instead of ??
**Sources:** code-reviewer, critic, verifier, debugger, tracer | **Confidence:** HIGH
**File:** `src/lib/judge/auto-review.ts:186`

```typescript
maxTokens: config.maxTokens || 1024,
```

The `||` operator treats `0` as falsy. Some LLM providers support `maxTokens: 0` to indicate unconstrained generation length. If a user explicitly configures `maxTokens: 0`, this code incorrectly falls back to `1024`, producing unexpectedly long (and potentially expensive) AI reviews.

**Fix:** Use nullish coalescing:
```typescript
maxTokens: config.maxTokens ?? 1024,
```

---

## CARRY-FORWARD FINDINGS (still present from prior cycles)

### C32-3: [DEFERRED] Remaining `.json()` before `.ok` in non-critical components
**Sources:** DEFER-C30-4 | **Confidence:** HIGH
**Files:** 11 lower-impact components still use manual `.json().catch()` pattern.
**Exit criterion:** Apply `parseApiResponse` helper across all remaining components.

---

### C32-4: [DEFERRED] Raw API error strings without i18n translation
**Sources:** DEFER-C30-5 / C29 AGG-3 | **Confidence:** HIGH
**Files:** Multiple client components (7+ instances)
**Exit criterion:** Unified API error parsing helper that routes through `t()`.

---

### C32-5: [DEFERRED] `as { error?: string }` unsafe type assertions (22+ instances)
**Sources:** DEFER-C30-6 / C29 AGG-9 | **Confidence:** HIGH
**Exit criterion:** Typed `parseApiError` helper replaces all manual casts.

---

### C32-6: [DEFERRED] Admin routes bypass createApiHandler
**Sources:** C29 AGG-10 | **Confidence:** MEDIUM
**Files:** 15 manual routes duplicate auth/CSRF/rate-limit logic.
**Exit criterion:** Migrate routes to `createApiHandler` or extract composable middleware.

---

### C32-7: [DEFERRED] Recruiting validate endpoint token brute-force
**Sources:** C29 AGG-12 | **Confidence:** MEDIUM
**File:** `src/app/api/v1/recruiting/validate/route.ts`
**Exit criterion:** Add dedicated recruiting validation rate limit (5 req/min per IP).

---

### C32-8: [DEFERRED] Missing error boundaries
**Sources:** C29 AGG-15 | **Confidence:** MEDIUM
**Exit criterion:** Add dedicated ErrorBoundary components.

---

### C32-9: [DEFERRED] Hardcoded English strings in code editor defaults
**Sources:** C29 AGG-18 | **Confidence:** HIGH
**File:** `src/components/code/code-editor.tsx:36`
**Exit criterion:** Replace with i18n keys or ensure all callers pass translated strings.

---

### C32-10: [DEFERRED] Hardcoded English in throw new Error
**Sources:** C29 AGG-17 | **Confidence:** MEDIUM
**File:** `src/lib/auth/permissions.ts:69,76,88,96,101`
**Exit criterion:** Replace with i18n key identifiers.

---

### C32-11: [DEFERRED] formData.get() cast assertions without validation
**Sources:** C29 AGG-19 | **Confidence:** MEDIUM
**Files:** Multiple server routes.
**Exit criterion:** Add runtime type checks after all `formData.get()` calls.

---

### C32-12: [DEFERRED] Admin settings page exposes DB host/port
**Sources:** C29 AGG-14 | **Confidence:** MEDIUM
**Exit criterion:** Only expose database type and version, not host/port.

---

### C32-13: [DEFERRED] files/[id] GET selects storedName
**Sources:** C29 AGG-13 | **Confidence:** LOW
**File:** `src/app/api/v1/files/[id]/route.ts:76`
**Exit criterion:** Add explicit column exclusion comment or refactor.

---

## Positive Observations

- Strong TypeScript discipline with no `as any` casts
- Comprehensive error handling in API layer
- Proper resource cleanup (AbortController, timers, event listeners)
- Well-documented code with clear intent comments
- All gates pass consistently
- 2382 unit tests + 208 component tests, all passing
- No new high-severity findings in this cycle

## No Agent Failures

The comprehensive review completed successfully.
