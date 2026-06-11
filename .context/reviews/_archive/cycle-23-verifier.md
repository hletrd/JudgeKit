# Cycle 23 Verifier Review

**Date:** 2026-04-20
**Base commit:** bb6f3fc2

## Findings

### V-1: `countdown-timer.tsx` raw `fetch()` -- last remaining client-side fetch bypass [MEDIUM/HIGH]

**Files:** `src/components/exam/countdown-timer.tsx:76`
**Description:** Verified: this is the only `.tsx` file containing a raw `fetch()` call (confirmed via `grep -rn '\bfetch\s*\(' src/**/*.tsx`). All other client-side fetch calls in `.tsx` files have been migrated to `apiFetch`. The server-side `.ts` files legitimately use raw `fetch()` for inter-service communication (judge worker, compiler runner, rate limiter, hCaptcha, chat widget providers) -- these are correct and should not use `apiFetch`.
**Fix:** Replace `fetch("/api/v1/time", ...)` with `apiFetch("/api/v1/time", ...)`.
**Confidence:** HIGH

### V-2: `contest-quick-stats.tsx` empty catch violates documented error convention [LOW/MEDIUM]

**Files:** `src/components/contest/contest-quick-stats.tsx:76-78`
**Description:** Verified against `src/lib/api/client.ts` which documents: "Never silently swallow errors -- always surface them to the user." The `contest-quick-stats.tsx` `fetchStats` callback violates this convention. Other contest components in the same module directory properly show toast errors.
**Fix:** Add toast error feedback in the catch block.
**Confidence:** MEDIUM

## Verified Safe

- Cycle-22 H1 fix (chat widget apiFetch migration) is correctly implemented and verified in code.
- Cycle-22 M1 (access-code-manager error handling) is correctly implemented.
- Cycle-22 M2 (formatNumber re-export removal) is correctly implemented; no remaining imports from `@/lib/datetime` for `formatNumber`.
- Cycle-22 M3 (apiFetch unit tests) are present and cover the documented test cases.
- Cycle-22 M4 (workers page visibility polling) is correctly implemented.
- No regressions found in auth flow, CSRF validation, or HTML sanitization.
