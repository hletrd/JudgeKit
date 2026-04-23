# Architectural Review — RPF Cycle 18

**Date:** 2026-04-22
**Reviewer:** architect
**Base commit:** d32f2517

## ARCH-1: `api-keys-client.tsx` not migrated to `apiFetchJson` — last remaining raw-pattern admin component [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:137-191`
**Confidence:** HIGH

The API keys admin component is the last remaining admin component using raw `apiFetch` + `res.json().catch()` for both GET and POST patterns. All other admin components (language-config-table, chat-logs-client, workers-client) have been migrated to `apiFetchJson`. This creates a maintenance hazard where new developers may copy the old pattern.

**Fix:** Migrate `fetchKeys` and `handleCreate` to `apiFetchJson`.

---

## ARCH-2: `ContestsLayout` uses event delegation with hardcoded DOM queries — fragile pattern [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/contests/layout.tsx:40-43`
**Confidence:** MEDIUM

The layout uses `document.getElementById("main-content")` and `document.querySelector("[data-slot='sidebar']")` to attach click handlers. These DOM queries are fragile — if the IDs or data-slot attributes change, the handlers silently stop working. The `data-full-navigate` workaround itself is a known hack for a Next.js RSC streaming bug.

**Fix:** This is an acceptable workaround with a clear TODO. No immediate action needed, but consider adding a defensive check and console warning if the elements are not found.

---

## ARCH-3: `formatDetailsJson` in `participant-anti-cheat-timeline.tsx` violates i18n boundary [MEDIUM/MEDIUM]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:45-63`
**Confidence:** HIGH

This helper function returns hardcoded English strings ("Target: Code editor", etc.) but the component uses `useTranslations`. Helper functions outside the component scope cannot access the `t` function. This violates the project's i18n-first architecture.

**Fix:** Convert to a component method or pass the `t` function as a parameter.

---

## ARCH-4: Two separate `formatDuration` functions exist — potential for divergence [LOW/LOW]

**Files:**
- `src/components/exam/countdown-timer.tsx:17-24`
- `src/components/layout/active-timed-assignment-sidebar-panel.tsx:16-23`

**Confidence:** HIGH

Both components define an identical `formatDuration` function. If one is updated (e.g., to add days support), the other will be missed. The `formatting.ts` module already centralizes `formatNumber`, `formatScore`, `formatBytes`, etc. — `formatDuration` should live there too.

**Fix:** Move `formatDuration` to `src/lib/formatting.ts` and import it in both components.

---

## Verified Safe

- `apiFetchJson` adoption is comprehensive across contest components
- `useVisibilityPolling` is the standard polling pattern
- `copyToClipboard` utility properly centralizes clipboard logic
- Formatting utilities are well-consolidated in `src/lib/formatting.ts`
- Navigation patterns are centralized via `forceNavigate` and `public-nav`
- Auth flow uses proper session handling with `createApiHandler`
