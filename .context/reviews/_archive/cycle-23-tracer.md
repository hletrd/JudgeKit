# Cycle 23 Tracer Review

**Date:** 2026-04-20
**Base commit:** bb6f3fc2

## Findings

### TR-1: `countdown-timer.tsx` raw `fetch()` -- trace of apiFetch migration gap [MEDIUM/HIGH]

**Files:** `src/components/exam/countdown-timer.tsx:76`
**Description:** Tracing the apiFetch migration history:
1. Cycle 21 H1: Migrated 11 admin `fetch()` calls to `apiFetch`, scoped to `src/app/(dashboard)/dashboard/admin/`
2. Cycle 22 H1: Migrated 2 chat widget `fetch()` calls to `apiFetch`, scoped to `src/lib/plugins/`
3. The exam component at `src/components/exam/countdown-timer.tsx` was never in scope for either audit.

The root cause is that each migration was scoped to a specific directory rather than doing a global audit of all client-side `fetch()` calls. A global `grep -rn '\bfetch\s*\(' src/**/*.tsx` would have caught this.
**Fix:** Replace `fetch("/api/v1/time", ...)` with `apiFetch("/api/v1/time", ...)`.
**Confidence:** HIGH

### TR-2: `contest-quick-stats.tsx` empty catch -- trace of inconsistent error handling [LOW/MEDIUM]

**Files:** `src/components/contest/contest-quick-stats.tsx:76-78`
**Description:** Tracing the error handling pattern across contest components:
- `contest-clarifications.tsx:80`: `catch { toast.error(t("fetchError")); }` -- correct
- `contest-announcements.tsx:64`: `catch { toast.error(t("fetchError")); }` -- correct
- `contest-quick-stats.tsx:76`: `catch { // ignore }` -- inconsistent

The quick-stats component was likely written with the assumption that stats are supplementary and errors are non-critical. However, the project convention explicitly forbids silent error swallowing. The root cause is the lack of a linting rule or code review checklist for empty catch blocks.
**Fix:** Add toast error feedback matching the pattern in sibling components.
**Confidence:** MEDIUM

## Verified Safe

- No competing hypotheses found for any existing behavior. All findings trace back to scope gaps in prior migrations.
