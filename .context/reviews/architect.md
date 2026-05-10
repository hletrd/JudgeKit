# Architect Review — Cycle 33

**Reviewer:** architect
**Date:** 2026-05-10
**Scope:** Component architecture, coupling, layering, design patterns

---

## Findings

### C33-AR-1: [MEDIUM] Timer logic duplicated across multiple components

**Files:** 
- `src/components/submission-list-auto-refresh.tsx`
- `src/components/exam/anti-cheat-monitor.tsx`
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx`

**Confidence:** HIGH

Each component implements its own timer management (setTimeout, cleanup refs, backoff logic). This is duplicated 5+ times across the codebase with slight variations. A shared `useInterval` or `useTimer` hook would centralize the complexity and prevent leaks.

**Fix:** Extract a `useSafeInterval` hook that handles:
- Cleanup on unmount
- Backoff calculation
- Visibility-aware pausing

---

### C33-AR-2: [LOW] contests/manage/layout.tsx workaround belongs in framework layer

**File:** `src/app/(public)/contests/manage/layout.tsx`
**Confidence:** MEDIUM

The Next.js RSC streaming workaround is embedded in a layout component. If multiple route groups need similar workarounds, this pattern will proliferate. The TODO comment indicates it's temporary, but there's no tracking mechanism to remove it when upstream is fixed.

**Fix:** Extract to a reusable hook or document the workaround in a central location with a GitHub issue reference.

---

### C33-AR-3: [LOW] apiFetchJson success/failure typing could be stricter

**File:** `src/lib/api/client.ts:126-144`
**Confidence:** LOW

The return type `{ ok: true; data: T } | { ok: false; data: T }` requires callers to check `ok` but provides no type-level enforcement. A discriminated union with a type guard would be more ergonomic.

**Fix:** Consider:
```typescript
type ApiResult<T> = { success: true; data: T } | { success: false; error: string };
```

---

## Positive Observations

1. Anti-cheat logic cleanly separated into storage + monitor + monitor components.
2. apiFetch/client abstraction provides consistent CSRF handling.
3. Component composition patterns (slots, compound components) used well in UI layer.
