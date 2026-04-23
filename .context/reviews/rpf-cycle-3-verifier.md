# RPF Cycle 3 — Verifier

**Date:** 2026-04-22
**Base commit:** 678f7d7d

## Findings

### V-1: `SubmissionListAutoRefresh` error backoff is not actually functional — verified by reading Next.js `router.refresh()` API [MEDIUM/HIGH]

**File:** `src/components/submission-list-auto-refresh.tsx:38-44`
**Confidence:** HIGH

Verified: `useRouter().refresh()` from `next/navigation` triggers a server component revalidation. It does NOT return a promise that rejects on HTTP errors, and it does NOT throw when the server is unreachable. The try/catch on lines 38-44 will never enter the catch branch for network/server errors. The `errorCountRef` will always be 0.

This means the documented behavior ("When router.refresh() throws or the page is unreachable, increment error count for exponential backoff") on lines 32-34 is incorrect — the described behavior cannot occur.

**Fix:** Replace with `fetch()` + `router.refresh()` pattern, or remove the dead backoff code and document that no backoff is possible with `router.refresh()`.

---

### V-2: `contest-clarifications.tsx` `loadClarifications` dependency array includes `t` — may cause unnecessary re-fetches [LOW/LOW]

**File:** `src/components/contest/clarifications.tsx:92`
**Confidence:** LOW

The `useTranslations` hook returns a stable reference in `next-intl` v4, so `t` should not cause re-fetches in practice. However, if the i18n library updates the reference on locale change, it would restart polling. This is actually desired behavior (re-fetch in new locale), so this is acceptable.

---

### V-3: `recruiting-invitations-panel.tsx` `fetchData` dependency includes `stats` — verified potential for extra re-fetches [MEDIUM/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:110-134`
**Confidence:** HIGH (same as CR-4, DBG-3)

Verified: `stats` is in the dependency array of `fetchData` (line 134). Inside `fetchData`, `stats` is used as a fallback: `setStats(json.data ?? stats)`. When `fetchData` runs and updates `stats`, the `useCallback` reference changes (because `stats` changed), which triggers the `useEffect` on line 136 to run again. In practice, React's `useState` bailout prevents an infinite loop when the new value equals the old value, but if the API returns an object with different reference identity on each call, this would loop.

**Fix:** Use functional state update pattern to avoid needing `stats` in the dependency array.

---

### V-4: SSE `queryFullSubmission` includes `sourceCode` in SSE events — verified unnecessary data transfer [LOW/MEDIUM]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:463-488`
**Confidence:** HIGH (same as PERF-5)

Verified: The `queryFullSubmission` function does not exclude `sourceCode` from its select. The SSE "result" event therefore includes the full source code. The client (`use-submission-polling.ts`) already has the source code from the initial page load and uses `normalized.sourceCode || prev.sourceCode` to preserve it. So the source code in the SSE event is always overwritten by the fallback, making the transfer wasteful.

**Fix:** Add `sourceCode: false` to the columns selection in `queryFullSubmission`.

---

## Verified Safe

- `clipboard.ts` correctly implements the Clipboard API -> execCommand fallback pattern
- `contest-layout.tsx` correctly only intercepts `data-full-navigate` links
- `formatScore` is used correctly in `submission-detail-client.tsx`
- `compiler-client.tsx` keyboard shortcut correctly excludes textarea/input active elements
- All cycle 2 fixes have been properly applied and are working as documented
