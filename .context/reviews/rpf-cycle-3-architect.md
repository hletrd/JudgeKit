# RPF Cycle 3 — Architect

**Date:** 2026-04-22
**Base commit:** 678f7d7d

## Findings

### ARCH-1: `SubmissionListAutoRefresh` uses `router.refresh()` which cannot detect errors — architectural mismatch [MEDIUM/HIGH]

**File:** `src/components/submission-list-auto-refresh.tsx:38-44`
**Confidence:** HIGH

The component was designed with error backoff in mind (exponential backoff, max backoff cap), but `router.refresh()` is a fire-and-forget API that never throws. This is an architectural mismatch: the component's error-handling design cannot be realized with the chosen primitive.

**Fix:** Replace `router.refresh()` with `fetch('/api/v1/submissions?...')` + `router.refresh()` pattern: use the fetch to detect errors and apply backoff, then use `router.refresh()` to actually update the UI only on success.

---

### ARCH-2: 22 raw API route handlers still not using `createApiHandler` — inconsistent auth/CSRF/error handling [MEDIUM/MEDIUM] (carried forward, tracked as DEFER-1)

**File:** `src/app/api/v1/` (22 route files)
**Confidence:** HIGH

The `createApiHandler` wrapper provides consistent auth, CSRF, rate limiting, Zod validation, error handling, and cache headers. 22 raw route handlers manually implement these concerns with varying levels of completeness. This is a known deferred item but worth re-confirming.

**Status:** Carried forward. The raw handlers that were spot-checked (files, judge/poll, recruiting/validate) all implement auth and CSRF correctly. No security regression.

---

### ARCH-3: `contest-clarifications.tsx` mixes data fetching, polling, and UI in a single component — cohesion issue [LOW/LOW]

**File:** `src/components/contest/contest-clarifications.tsx`
**Confidence:** LOW

The component handles API fetching, polling with visibility-based intervals, form submission, answer management, and rendering. It would benefit from extracting the data fetching/polling logic into a custom hook (similar to `useSubmissionPolling`). This is a maintainability suggestion, not a bug.

---

### ARCH-4: Dynamic `import()` for clipboard utility used in multiple components — should be static import [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:183,208,310`
**Confidence:** HIGH

The `recruiting-invitations-panel.tsx` uses dynamic `import("@/lib/clipboard")` in three places. The clipboard utility is a tiny module (37 lines, no side effects) that will be bundled with the page anyway. Dynamic imports are useful for code splitting large modules, but here they just add unnecessary async overhead and make the code harder to read.

**Fix:** Convert to static import at the top of the file.

---

## Verified Safe

- `contest-layout.tsx` properly uses opt-in `data-full-navigate` pattern
- `createApiHandler` provides robust middleware layer for migrated routes
- SSE route correctly documents why it can't use `createApiHandler` (streaming response)
