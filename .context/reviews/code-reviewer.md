# Code Review — Cycle 32

**Reviewer:** code-reviewer (manual)
**Date:** 2026-05-10
**Scope:** Code quality, logic correctness, maintainability

---

## Verified Fixes from Prior Cycles

All cycle 31 fixes confirmed intact:
- `compiler-client.tsx:268` no longer uses `res.statusText`
- `json-ld.tsx:13-14` RegExp objects are module-level constants
- All gates pass (eslint, tsc, next build, vitest unit + component)

---

## New Findings

### C32-CODE-1: [MEDIUM] SSE parser calls controller.close() after controller.error()

**File:** `src/lib/plugins/chat-widget/providers.ts:491-495`

The `transformSSE` function has a try/catch/finally structure:

```typescript
try {
  while (true) {
    const { done, value } = await reader.read();
    // ...
  }
  // ...
} catch (err) {
  controller.error(err);     // line 492
} finally {
  reader.releaseLock();
  controller.close();        // line 495
}
```

**Problem:** `ReadableStreamDefaultController.error()` and `.close()` are mutually exclusive. Once `error()` transitions the stream to the "errored" state, calling `close()` throws a `TypeError: "Cannot close a stream that has already been closed or errored"`. This unhandled exception in the finally block can mask the original error and potentially cause issues for consumers of the stream.

**Fix:** Guard the `controller.close()` call with a flag, or move `controller.close()` into the try block before the catch (after the successful loop), and omit it from finally:

```typescript
let streamClosed = false;
try {
  // ... loop ...
  if (!streamClosed) {
    streamClosed = true;
    controller.close();
  }
} catch (err) {
  controller.error(err);
} finally {
  reader.releaseLock();
}
```

**Confidence:** HIGH

---

### C32-CODE-2: [LOW] maxTokens fallback uses || instead of ??

**File:** `src/lib/judge/auto-review.ts:186`

```typescript
maxTokens: config.maxTokens || 1024,
```

**Problem:** The `||` operator treats `0` as falsy. Some LLM providers support `maxTokens: 0` to indicate unconstrained generation length. If a user explicitly configures `maxTokens: 0`, this code incorrectly falls back to `1024`.

**Fix:** Use nullish coalescing:
```typescript
maxTokens: config.maxTokens ?? 1024,
```

**Confidence:** HIGH

---

## No Other Issues Found

- All JSON.parse calls have try/catch guards
- All fetch calls have AbortSignal timeout
- Event listeners have proper cleanup
- No `eval()` or `Function()` constructor usage
- No shell injection vectors
