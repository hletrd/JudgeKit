# RPF Cycle 1 — Document Specialist

**Date:** 2026-04-22
**Base commit:** b1271d6a
**Reviewer:** document-specialist

## Inventory of Reviewed Files

- `src/lib/api/client.ts` (JSDoc)
- `src/lib/formatting.ts` (JSDoc)
- `src/hooks/use-visibility-polling.ts` (JSDoc)
- `src/components/submission-list-auto-refresh.tsx` (comments)
- `src/app/api/v1/contests/[assignmentId]/stats/route.ts` (no docs)
- `src/components/contest/contest-quick-stats.tsx` (comments)

## Findings

### DOC-1: Stats API route has no JSDoc or endpoint documentation [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts`

**Description:** The new stats endpoint has no JSDoc comment describing the response shape, access control requirements, or rate limit. Other routes like the leaderboard have inline comments. This route should document:
- Response shape: `{ data: { participantCount, submittedCount, avgScore, problemsSolvedCount } }`
- Access control: same as leaderboard
- Rate limit: "leaderboard"

**Fix:** Add a JSDoc comment at the top of the file.

### DOC-2: `SubmissionListAutoRefresh` comment references unauthenticated endpoint [LOW/LOW]

**File:** `src/components/submission-list-auto-refresh.tsx:44-47`

**Description:** The comment says "Note: /api/v1/time is unauthenticated, so this backoff only activates for network/server errors, not session expiry." This is accurate and helpful. The comment was correctly updated when switching from `fetch` to `apiFetch` (the X-Requested-With header doesn't affect authentication). No fix needed.

### DOC-3: `contest-quick-stats.tsx` removed the TODO about stats endpoint [CONFIRMED]

**Description:** The previous code had a TODO: "Replace full leaderboard fetch with a dedicated /stats endpoint for efficiency." The working tree refactor removes this TODO because the stats endpoint now exists. Correct.

## Summary

| ID | Severity | Confidence | Description |
|----|----------|------------|-------------|
| DOC-1 | LOW | MEDIUM | Stats API route has no documentation |
