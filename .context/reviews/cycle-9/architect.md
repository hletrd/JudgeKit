# Architect — Cycle 9

**Date:** 2026-05-11
**HEAD reviewed:** `06f74d76`
**Change surface:** 0 new commits since cycle 8.

---

## Finding C9-ARCH-1: Duplicate JSON-parse-then-branch pattern across 4+ components (LOW)

**Files:**
- `src/app/(auth)/verify-email/page.tsx`
- `src/app/(auth)/forgot-password/forgot-password-form.tsx`
- `src/app/(auth)/reset-password/reset-password-form.tsx`
- `src/app/(public)/problems/create/create-problem-form.tsx`
**Confidence:** High

These components independently implement the same `fetch -> json().catch(fallback) -> if (!res.ok)` pattern instead of using the project's `apiFetchJson` helper. This violates DRY and creates a maintenance risk: fixes to the pattern (like C9-CR-3) must be applied in multiple places.

**Suggested fix:** Refactor these components to use `apiFetchJson`, which already handles the ok+parseOk check correctly.

---

## Finding C9-ARCH-2: Inconsistent shutdown signal handling (LOW)

**File:** `src/lib/audit/node-shutdown.ts`
**Confidence:** High

SIGTERM (fixed in cycle 8) and SIGINT have divergent behaviors: SIGTERM allows natural exit, SIGINT forces exit code 130. This inconsistency makes it harder to reason about shutdown behavior and could lead to unexpected termination ordering in containerized environments where both signals may be sent.

**Suggested fix:** Align SIGINT with SIGTERM — both should allow natural exit.

---

## Final Sweep

No new architectural coupling, layering violations, or design risks. The 20 raw API handlers (ARCH-CARRY-1) and SSE coordination (ARCH-CARRY-2) remain appropriately deferred.
