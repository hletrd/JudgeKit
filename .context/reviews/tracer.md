# Tracer Review — Cycle 32

**Reviewer:** tracer (manual)
**Date:** 2026-05-10
**Scope:** Causal tracing of suspicious flows

---

## Traced Flow: SSE Parser Error Path

**File:** `src/lib/plugins/chat-widget/providers.ts:444-498`

**Flow:**
1. Gemini/OpenAI/Claude provider.stream() calls transformSSE()
2. transformSSE creates a new ReadableStream with start(controller)
3. start() creates a reader from the upstream body
4. In the loop, reader.read() may throw (network error, abort, etc.)
5. Error propagates to catch block → controller.error(err)
6. finally runs → reader.releaseLock() → controller.close()
7. controller.close() throws because stream is in "errored" state

**Root cause:** The finally block unconditionally calls controller.close() without checking if the stream has already been errored.

**Cross-file impact:** This affects all three providers (openai, claude, gemini) since they all use transformSSE().

**Confidence:** HIGH

---

## Traced Flow: Auto-review maxTokens

**File:** `src/lib/judge/auto-review.ts:186`

**Flow:**
1. Plugin config is parsed via Zod schema (chatWidgetConfigSchema)
2. config.maxTokens is extracted from parsed config
3. Provider.chatWithTools() is called with maxTokens: config.maxTokens || 1024
4. If config.maxTokens is 0, JavaScript evaluates 0 || 1024 → 1024
5. The provider receives 1024 instead of 0

**Root cause:** || treats 0 as falsy; ?? is the correct operator.

**Confidence:** HIGH
