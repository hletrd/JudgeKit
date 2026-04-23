# RPF Cycle 2 — Architect

**Date:** 2026-04-22
**Base commit:** 14218f45

## Findings

### ARCH-1: Visibility-aware polling pattern duplicated across 6+ components — no shared hook [LOW/MEDIUM]

**Files:**
- `src/components/contest/contest-clarifications.tsx:87-111`
- `src/components/contest/contest-announcements.tsx:71-95`
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:247-270`
- `src/components/contest/participant-anti-cheat-timeline.tsx:128-142`
- `src/components/contest/leaderboard-table.tsx:250-265`
- `src/components/contest/contest-replay.tsx:70-82`

**Description:** At least 6 components implement their own visibility-aware polling pattern with `document.addEventListener("visibilitychange", ...)` + `setInterval` + cleanup. While each has slight variations, the core logic (start interval when visible, clear when hidden, fetch on visibility change) is identical. This was deferred as DEFER-21 in cycle 28. The risk is that a bug fix in one component (e.g., adding backoff) would need to be manually replicated across all others.

**Fix:** Extract a `useVisibilityAwarePolling(fetchFn, intervalMs)` hook.

### ARCH-2: `copyToClipboard` imported via dynamic `await import()` in 5 components but static import in 2 — inconsistent import strategy [LOW/LOW]

**Files:**
- Static: `src/components/code/copy-code-button.tsx:8`
- Dynamic: `src/components/contest/access-code-manager.tsx:61`, `src/components/contest/recruiting-invitations-panel.tsx:183,208,310`, `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:196,211`, `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:158`, `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:97`

**Description:** After the cycle 1 clipboard consolidation, most components use `const { copyToClipboard } = await import("@/lib/clipboard")` while `copy-code-button.tsx` uses a static import. The dynamic import is unnecessary here — `@/lib/clipboard` is a tiny module (37 lines) with no heavy dependencies. Dynamic imports add micro-overhead and make the code harder to grep.

**Fix:** Use static imports across all components for consistency and bundle optimization.

## Verified Safe

- `createApiHandler` provides consistent middleware pipeline for API routes
- SSE events route has proper connection tracking and cleanup
- Draft persistence architecture (useSyncExternalStore + debounced writes) is well-designed
- Auth config uses Argon2id with timing-safe dummy hash
