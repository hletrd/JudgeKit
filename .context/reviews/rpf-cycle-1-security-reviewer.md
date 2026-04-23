# RPF Cycle 1 — Security Reviewer

**Date:** 2026-04-22
**Base commit:** b1271d6a
**Reviewer:** security-reviewer

## Inventory of Reviewed Files

- `src/components/contest/contest-quick-stats.tsx`
- `src/components/submission-list-auto-refresh.tsx`
- `src/components/contest/recruiting-invitations-panel.tsx`
- `src/components/exam/anti-cheat-monitor.tsx`
- `src/components/seo/json-ld.tsx`
- `src/app/api/v1/contests/[assignmentId]/stats/route.ts`
- `src/lib/api/client.ts`
- `src/lib/submissions/status.ts`
- `src/hooks/use-source-draft.ts`

## Findings

### SEC-1: `json-ld.tsx` safeJsonForScript does not escape `<!--` [LOW/MEDIUM]

**File:** `src/components/seo/json-ld.tsx:11-13`

**Description:** `safeJsonForScript` only replaces `</script` but not `<!--` which can break out of script tags in HTML. While `JSON.stringify` escapes `<` in V8/SpiderMonkey, the ES spec does not guarantee this. In an HTML parser context, `<!--` inside a `<script>` tag can terminate the script block in legacy parsing modes.

**Fix:** Add `.replace(/<!--/g, '<\\!--')` after existing replacement.

**Confidence:** Medium — requires specific HTML parsing context to exploit.

### SEC-2: Stats API route — access control checks are correct [CONFIRMED OK]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:24-58`

**Description:** The route properly checks: (1) assignment exists and is exam mode, (2) instructor access, (3) recruiting candidate access, (4) enrollment or access token for non-instructors. This mirrors the leaderboard access control. No issue.

### SEC-3: Anti-cheat monitor localStorage data not validated on read [LOW/LOW]

**File:** `src/components/exam/anti-cheat-monitor.tsx:34-43`

**Description:** `loadPendingEvents` validates each event with `isValidPendingEvent()` before returning. This is good. The `details` field is typed as `string | undefined` and is sent to the server, which should validate it. No immediate issue but noting for defense-in-depth.

## Summary

| ID | Severity | Confidence | Description |
|----|----------|------------|-------------|
| SEC-1 | LOW | MEDIUM | json-ld.tsx safeJsonForScript missing `<!--` escape |
| SEC-3 | LOW | LOW | Anti-cheat localStorage details field not validated |
