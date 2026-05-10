# Architecture Review — Cycle 32

**Reviewer:** architect (manual)
**Date:** 2026-05-10
**Scope:** Design risks, coupling, layering, maintainability

---

## Verified Architecture

- createApiHandler adoption is comprehensive (219 references vs 104 route files)
- Chat provider abstraction is clean (openai/claude/gemini unified interface)
- Auto-review is properly decoupled from judge pipeline (errors don't affect judging)
- SSE abstraction (transformSSE) provides reusable streaming text extraction

---

## New Findings

### C32-ARCH-1: [MEDIUM] SSE parser has incorrect lifecycle management

**File:** `src/lib/plugins/chat-widget/providers.ts:444-498`

**Problem:** The transformSSE function is a reusable abstraction for streaming text from SSE responses. However, its internal ReadableStream lifecycle management has a bug where controller.close() is called after controller.error() in the finally block. This breaks the abstraction's contract — consumers expect either a clean close or an error, not a cascading failure.

**Fix:** Remove controller.close() from finally; call it only on successful completion in the try block.

**Confidence:** HIGH

---

## Carry-Forward

- 15 routes still bypass createApiHandler (deferred from C29)
- Admin settings exposes DB host/port (deferred from C29)
