# Verifier Review — RPF Cycle 18

**Date:** 2026-04-22
**Reviewer:** verifier
**Base commit:** d32f2517

## V-1: `participant-anti-cheat-timeline.tsx` polling may display duplicate events at page boundary — confirmed [MEDIUM/MEDIUM]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:96-114`
**Confidence:** MEDIUM

Verified the debugger's finding (DBG-1). The polling logic preserves events beyond `PAGE_SIZE` but assumes a stable offset boundary. If new events are created between polls, the first-page refresh and the preserved second-page data may overlap at the boundary.

**Evidence:** The code at line 103 checks `if (prev.length > PAGE_SIZE)` and replaces `freshFirstPage` + `prev.slice(PAGE_SIZE)`. This is correct only if no new events were added between the initial load and the poll refresh. If 5 events were added, `freshFirstPage` includes events that were previously at indices 5-54, but `prev.slice(PAGE_SIZE)` still includes the old indices 50-99 which now correspond to server indices 55-104. The boundary events (old indices 50-54) are duplicated.

**Fix:** On poll refresh, reset to just the first page, or deduplicate by event ID.

---

## V-2: `api-keys-client.tsx` not using `apiFetchJson` — confirmed inconsistent [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:137-191`
**Confidence:** HIGH

Verified the architect's finding (ARCH-1). The component uses raw `apiFetch` + `res.json().catch()` in both `fetchKeys` and `handleCreate`. All other admin components have been migrated. The behavior is functionally correct but inconsistent with the established pattern.

---

## V-3: `formatDetailsJson` hardcoded English — confirmed i18n violation [MEDIUM/HIGH]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:45-63`
**Confidence:** HIGH

Verified the code-reviewer (CR-4) and critic (CRI-1) findings. The function returns "Target: Code editor", "Target: Problem description" etc. as hardcoded English strings. The component uses `useTranslations` but the helper function cannot access `t()`.

**Evidence:** Line 50-57 shows `const labels: Record<string, string> = { "code-editor": "Code editor", ...}` and line 58 returns `` `Target: ${label}` ``. The word "Target:" and the label values are not localized.

---

## Previously Fixed — Verified

- All cycle-17 fixes confirmed: `res.json()` guards, `apiFetchJson` migrations, AbortController, aria-labels
- `countdown-timer.tsx` uses `aria-live="polite"` for non-1-minute thresholds
- Anti-cheat privacy notice uses Dialog component
- `test-connection/route.ts` returns 400 for malformed JSON
- CSV downloads use programmatic `<a>` click with `noopener,noreferrer`
