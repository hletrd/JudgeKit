# Document Specialist Review — RPF Cycle 18

**Date:** 2026-04-22
**Reviewer:** document-specialist
**Base commit:** d32f2517

## DOC-1: `formatDetailsJson` labels in `participant-anti-cheat-timeline.tsx` are not documented for localization [LOW/MEDIUM]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:51-57`
**Confidence:** HIGH

The `formatDetailsJson` function contains a `labels` mapping from target identifiers to English display strings. This mapping is not documented in any localization guide and is not connected to the i18n system. New target types added in the future will show raw identifiers until this mapping is updated.

**Fix:** Move the labels to i18n keys and document the pattern for adding new target types.

---

## DOC-2: `apiFetchJson` JSDoc is comprehensive and accurate [NO ISSUE]

**File:** `src/lib/api/client.ts:87-123`
**Confidence:** HIGH

The JSDoc for `apiFetchJson` properly documents the `signal` option, the `fallback` parameter, and provides a clear example. The error handling convention documentation in `client.ts` is thorough and up-to-date with the current codebase patterns.

---

## DOC-3: `formatting.ts` JSDoc is comprehensive — `formatNumber`, `formatBytes`, `formatDifficulty`, `formatScore`, `formatContestTimestamp` all documented [NO ISSUE]

**File:** `src/lib/formatting.ts`
**Confidence:** HIGH

All formatting utilities have proper JSDoc with examples. The `formatDifficulty` function correctly documents the regex patterns used for zero-stripping.

---

## DOC-4: `useVisibilityPolling` JSDoc is accurate [NO ISSUE]

**File:** `src/hooks/use-visibility-polling.ts:1-16`
**Confidence:** HIGH

The hook's JSDoc accurately describes its behavior: starts on visible, pauses on hidden, resumes with immediate fetch on visible. The note about callbacks handling their own errors is correct.

---

## Verified Safe

- `apiFetch` JSDoc is accurate and up-to-date
- `copyToClipboard` utility has proper JSDoc
- Error handling convention table in `client.ts` is accurate
