# Debugger Review — Cycle 32

**Reviewer:** debugger (manual)
**Date:** 2026-05-10
**Scope:** Latent bugs, failure modes, regressions

---

## Failure Mode Analysis

### C32-DEBUG-1: [MEDIUM] SSE parser secondary exception masks original error

**File:** `src/lib/plugins/chat-widget/providers.ts:491-495`

**Failure scenario:**
1. Network error occurs during reader.read()
2. catch block calls controller.error(networkError)
3. finally block calls controller.close()
4. controller.close() throws TypeError because stream is already errored
5. The TypeError from step 4 becomes the effective exception
6. Original networkError is lost or masked

**Impact:** Makes debugging streaming issues harder; the wrong error is propagated.

**Fix:** Remove controller.close() from finally; only call it on the success path.

**Confidence:** HIGH

### C32-DEBUG-2: [LOW] maxTokens=0 silently overridden

**File:** `src/lib/judge/auto-review.ts:186`

**Failure scenario:**
1. Admin configures chat-widget with maxTokens: 0
2. Auto-review triggers for an accepted submission
3. maxTokens is silently overridden to 1024
4. User receives unexpectedly long (and expensive) AI review

**Fix:** Use ?? instead of ||

**Confidence:** MEDIUM
