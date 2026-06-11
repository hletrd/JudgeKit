# RPF Cycle 15 — Critic

**Date:** 2026-04-20
**Base commit:** f0bef9cb

## Findings

### CRI-1: Recruiting invitation `expiryDate` lacks upper-bound validation (same as SEC-1) [MEDIUM/MEDIUM]

**File:** `src/lib/validators/recruiting-invitations.ts:10`

The rpf-14 fix (H1) correctly replaced client-computed `expiresAt` with server-computed values from `expiryDays`/`expiryDate`. However, while `expiryDays` is constrained to `max(3650)`, `expiryDate` has no upper bound. A privileged user can set `expiryDate: "2099-12-31"` to create effectively non-expiring invitations, partially defeating the purpose of the rpf-14 fix. The API keys route has the same `expiryDays: max(3650)` constraint but no `expiryDate` field, so it's not affected.

**Fix:** Add an upper-bound check on the computed `expiresAt` in the route handler, consistent with the 3650-day maximum.

**Confidence:** MEDIUM

### CRI-2: Inconsistent clipboard error handling across components [LOW/MEDIUM]

**Files:** `src/components/contest/recruiting-invitations-panel.tsx:199`, `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:196`, `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:169`

The recruiting invitations panel's `handleCopyLink` at line 199 calls `await navigator.clipboard.writeText(url)` without try/catch. The API keys client wraps it in try/catch with a fallback. The workers client doesn't wrap it either. Three different patterns for the same operation.

**Fix:** Standardize clipboard operations with a shared `copyToClipboard(text, toastFn)` utility that handles errors consistently.

**Confidence:** MEDIUM

### CRI-3: `handleCopyLink` timer not cleaned up on unmount (same as CR-4) [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:201`

The `setTimeout` for resetting `copiedId` is not tracked or cleaned up. This is a minor state leak on unmount. The API keys client correctly tracks timers with refs.

**Confidence:** LOW

## Verified Safe

- All rpf-14 remediation items (H1, H2, M1, M2, M3, L1) are correctly implemented — verified.
- Prior rpf-13 fixes remain intact — verified.
- Korean letter-spacing correctly handled everywhere — verified.
