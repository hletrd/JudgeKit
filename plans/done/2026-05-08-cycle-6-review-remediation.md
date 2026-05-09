# Cycle 6 Review Remediation Plan

**Date:** 2026-05-08
**Review source:** `.context/reviews/_aggregate.md` (cycle 6/100)
**HEAD:** main / 75d82a17
**Goal:** Fix all findings from cycle 6 code review and test-engineer review.

---

## Items to implement this cycle

### 1. C6-CR-1 — Fix PublicFooter duplicate React keys
- **File:** `src/components/layout/public-footer.tsx` (lines 32-36, 47-55)
- **Task:** Deduplicate the `allLinks` array by URL before rendering, so hardcoded `/languages` and `/privacy` links do not collide with CMS-provided links that have the same URL.
- **Approach:** Filter the CMS `links` array to exclude entries whose `url` matches `/languages` or `/privacy` before concatenating with the hardcoded links. This preserves CMS custom labels for other URLs while ensuring unique keys.
- **Status:** DONE — deduplication logic committed in `df8cbd6f`

### 2. C6-CR-2 — Fix chat widget index-based React key
- **File:** `src/lib/plugins/chat-widget/chat-widget.tsx` (line 334)
- **Task:** Replace `key={i}` with a stable message identifier.
- **Approach:** Added `id: string` to the `Message` interface and generate `nanoid()` IDs when creating user and assistant messages. Updated render to use `key={msg.id}`.
- **Status:** DONE — committed in `11090b78`

---

## Deferred

None — both findings are actionable this cycle and are correctness/UI quality issues that should not be deferred.

---

## Gate requirements

- `npx eslint .` — must pass 0 errors, 0 warnings
- `npx tsc --noEmit` — must pass
- `npx next build` — must pass
- `npx vitest run` — must pass (2337 tests)
- `npx vitest run --config vitest.config.component.ts` — must pass (167 tests)
