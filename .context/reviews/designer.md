# UI/UX Review — RPF Cycle 14

**Date:** 2026-04-22
**Reviewer:** designer
**Base commit:** 023ae5d4

## Previously Fixed Items (Verified)

All cycle 13 designer findings are fixed:
- DES-1 (workers-client.tsx icon-only buttons): Fixed — all six buttons now have `aria-label`
- DES-2 (group-instructors-manager.tsx remove button): Fixed — `aria-label` added

## Findings

### DES-1: No remaining icon-only button `aria-label` violations found [RESOLVED]

**Description:** After verifying all `size="icon"` and `size="icon-sm"` buttons across the codebase, all icon-only buttons now have proper `aria-label` attributes. The systemic pattern identified over cycles 11-13 has been fully addressed at the component level.

**Remaining risk:** New icon-only buttons could be added without `aria-label` in the future. See ARCH-2 from cycle 13 for recommended structural fix (custom `IconButton` component or ESLint rule).

**Confidence:** HIGH

---

### DES-2: `contest-join-client.tsx` — 1-second artificial delay before navigation [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:57`

**Description:** After a successful contest join, the code uses `await new Promise((resolve) => setTimeout(resolve, 1000))` before navigating to the contest page. During this second, the user sees a success animation with a pulsing checkmark. While the animation is nice, the 1-second delay is perceptible and adds unnecessary latency to the flow.

From a UX perspective, 500ms would be sufficient to communicate success without making the user wait.

**Fix:** Reduce the delay to 500ms or use `startTransition` for the navigation.

**Confidence:** LOW

---

### DES-3: Workers admin page `JUDGE_BASE_URL` uses `window.location.origin` — carried from DES-3 (cycle 13) [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:147`

**Description:** Carried from DES-3 (cycle 13). The "Add Worker" dialog displays Docker and deploy script commands with `JUDGE_BASE_URL` set to `window.location.origin`. If the app is behind a reverse proxy with a different public URL, the displayed command would be incorrect. This overlaps with SEC-3/DEFER-24.

**Fix:** Use a server-provided `appUrl` config value instead of `window.location.origin`.

**Confidence:** LOW

---

## Final Sweep

The accessibility issue with icon-only buttons has been fully resolved across the codebase. No new WCAG violations were found. The remaining UX concerns are minor: the 1-second delay in contest join and the `window.location.origin` issue for worker commands (carried from cycle 13).
