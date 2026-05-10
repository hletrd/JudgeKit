# Cycle 32 Review Remediation Plan

**Date:** 2026-05-10
**Based on:** `.context/reviews/_aggregate.md` (Cycle 32)
**HEAD:** b1c3564b

---

## Active Tasks

### C32-1: Fix SSE parser calling controller.close() after controller.error()

- **File:** `src/lib/plugins/chat-widget/providers.ts:491-495`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Original finding:** C32-1

**Problem:**
The `transformSSE` function has:
```typescript
try {
  // ... read loop ...
} catch (err) {
  controller.error(err);     // line 492
} finally {
  reader.releaseLock();
  controller.close();        // line 495
}
```

Per the WHATWG Streams spec, `controller.error()` and `controller.close()` are mutually exclusive. Once `error()` transitions the stream to the "errored" state, calling `close()` throws a TypeError.

**Fix:**
Move `controller.close()` into the try block (on the success path only), and remove it from finally:
```typescript
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // ... process value ...
  }
  // Process remaining buffer
  if (buffer.trim()) {
    // ...
  }
  controller.close();  // <-- move here
} catch (err) {
  controller.error(err);
} finally {
  reader.releaseLock();
  // controller.close() removed from here
}
```

**Implementation:**
- [ ] Update transformSSE in providers.ts
- [ ] Run gates

**Exit criterion:** `controller.close()` is only called on the success path, not in finally.

---

### C32-2: Fix maxTokens fallback to use ?? instead of ||

- **File:** `src/lib/judge/auto-review.ts:186`
- **Severity:** LOW
- **Confidence:** HIGH
- **Original finding:** C32-2

**Problem:**
```typescript
maxTokens: config.maxTokens || 1024,
```

The `||` operator treats `0` as falsy. If a user explicitly sets `maxTokens: 0`, it incorrectly falls back to `1024`.

**Fix:**
```typescript
maxTokens: config.maxTokens ?? 1024,
```

**Implementation:**
- [ ] Update auto-review.ts line 186
- [ ] Run gates

**Exit criterion:** `config.maxTokens` uses nullish coalescing (`??`).

---

## Carry-Forward Deferred Items (unchanged)

- **DEFER-C30-4:** Remaining `.json()` before `.ok` in non-critical components (11 files) — MEDIUM
- **DEFER-C30-5:** Raw API error strings without i18n translation (7+ instances) — MEDIUM
- **DEFER-C30-6:** `as { error?: string }` unsafe type assertions (22+ instances) — MEDIUM
- **C19-2:** Transaction wrapper inconsistency (`judge/poll/route.ts:136`) — LOW, 12 cycles deferred
- **C25-6:** Client-side console.error (8 remaining instances) — LOW, deferred
- **C25-7:** WeakMap complexity (`api-rate-limit.ts:62-72`) — LOW, deferred
- **C29 AGG-10:** Admin routes bypass createApiHandler (15 routes) — MEDIUM, deferred
- **C29 AGG-12:** Recruiting validate endpoint token brute-force — MEDIUM, deferred
- **C29 AGG-13:** files/[id] GET selects storedName — LOW, deferred
- **C29 AGG-14:** Admin settings page exposes DB host/port — LOW, deferred
- **C29 AGG-15:** Missing error boundaries — MEDIUM, deferred
- **C29 AGG-17:** Hardcoded English in throw new Error (`permissions.ts`) — LOW, deferred
- **C29 AGG-18:** Hardcoded English fallback strings in code-editor.tsx — LOW, deferred
- **C29 AGG-19:** formData.get() cast assertions without validation — LOW, deferred

---

## Gate Results (Pre-Implementation)

- [x] `npx eslint .` passes (0 errors)
- [x] `npx tsc --noEmit` passes
- [x] `npx next build` passes
- [x] `npx vitest run` passes — 315 files, 2382 tests (all pass)
- [x] `npx vitest run --config vitest.config.component.ts` passes — 68 files, 208 tests (all pass)
