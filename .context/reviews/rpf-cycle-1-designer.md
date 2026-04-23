# RPF Cycle 1 — Designer

**Date:** 2026-04-22
**Base commit:** b1271d6a
**Reviewer:** designer

## Inventory of Reviewed Files

- `src/components/contest/contest-quick-stats.tsx`
- `src/components/contest/leaderboard-table.tsx`
- `src/components/contest/recruiting-invitations-panel.tsx`
- `src/components/submission-list-auto-refresh.tsx`
- `src/components/exam/anti-cheat-monitor.tsx`
- `src/components/contest/contest-announcements.tsx`
- `src/components/contest/contest-clarifications.tsx`
- `src/components/submission-status-badge.tsx`

## Findings

### DES-1: `leaderboard-table.tsx` — score display not locale-formatted [LOW/MEDIUM]

**File:** `src/components/contest/leaderboard-table.tsx:200,428`

**Description:** IOI cell scores and total scores display raw numbers without locale-aware formatting. For Korean users (primary audience per CLAUDE.md), large numbers like 1,234 display without digit grouping.

**Fix:** Use `formatScore` with locale.

### DES-2: `submission-status-badge.tsx` — tooltip score not locale-formatted [LOW/MEDIUM]

**File:** `src/components/submission-status-badge.tsx:89`

**Description:** Score in tooltip uses `Math.round(score * 100) / 100`. Should use `formatScore` for consistency.

### DES-3: `recruiting-invitations-panel.tsx` — stats numbers not locale-formatted [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:332`

**Description:** Stats cards display `{stats[key]}` which are small numbers (counts of invitations) that typically don't need digit grouping. Low priority.

### DES-4: `contest-quick-stats.tsx` — mixed `formatNumber` call styles [LOW/LOW]

**File:** `src/components/contest/contest-quick-stats.tsx:80,86,95,104`

**Description:** Three calls use positional form `formatNumber(value, locale)` and one uses options form `formatNumber(value, { locale, maximumFractionDigits: 1 })`. Both work but mixing styles reduces readability.

## Summary

| ID | Severity | Confidence | Description |
|----|----------|------------|-------------|
| DES-1 | LOW | MEDIUM | Leaderboard scores not locale-formatted |
| DES-2 | LOW | MEDIUM | Status badge tooltip score not locale-formatted |
| DES-3 | LOW | LOW | Invitations stats numbers not locale-formatted |
| DES-4 | LOW | LOW | Mixed formatNumber call styles in quick-stats |
