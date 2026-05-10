# Aggregate Review — Cycle 19/100

**Date:** 2026-05-08
**HEAD:** 18b479ac
**Agents:** code-reviewer, security-reviewer, perf-reviewer, test-engineer (all manual)

---

## DEDUPLICATED FINDINGS

### C19-1: [MEDIUM] ContestReplay unsafe parseInt type assertion for playback speed

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/contest/contest-replay.tsx:214`
- **Found by:** code-reviewer, security-reviewer, perf-reviewer (cross-agent agreement)
- **Summary:** The Select `onValueChange` handler uses `parseInt(v, 10) as (typeof PLAYBACK_SPEEDS)[number]` without validating that the parsed value is actually in the allowed set. If `v` is empty or invalid, `parseInt` returns `NaN`, `speed` becomes `NaN`, and `1400 / NaN` in the playback timer causes `setTimeout` to fire immediately (treated as 0ms). The callback unconditionally reschedules, creating a UI-freezing rapid-fire loop.
- **Fix:** Validate `parsed` against `PLAYBACK_SPEEDS.includes(parsed)` before calling `setSpeed`.

### C19-2: [LOW] RecruitingInvitationsPanel metadata fields use index-based React key

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/contest/recruiting-invitations-panel.tsx:472`
- **Found by:** code-reviewer
- **Summary:** Dynamic metadata field rows in the invitation creation dialog use `key={i}`. While functionally tolerable today (no reordering, controlled inputs), it is a React anti-pattern that can cause stale DOM state on deletion (cursor position, focus, scroll).
- **Fix:** Generate stable IDs (e.g., `nanoid()`) when fields are added, store in field objects, use `key={field.id}`.

### C19-3: [LOW] Uncommitted Korean copy improvements in messages/ko.json

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `messages/ko.json`
- **Found by:** code-reviewer
- **Summary:** The working tree has unstaged modifications to `messages/ko.json` replacing em-dashes with periods in Korean error messages. These appear to be intentional copy improvements for readability. They should be committed as part of this cycle's work.

---

## DEFERRED / NO FINDINGS

- Skeleton/placeholder `key={i}` usages (anti-cheat-dashboard, analytics-charts, leaderboard-table, participant-anti-cheat-timeline) are acceptable — presentational elements with no state.
- Timer leaks: all fixed in prior cycles; current code correctly cleans up.
- AbortController leaks: language-config-table correctly uses per-operation refs.
- Security: all API routes implement proper auth/authz; no new vulnerabilities found.
- Performance: no new regressions; polling hooks use correct patterns.
- Tests: all gates green (314 unit + 66 component = 380 files, 2507 tests pass).

## AGENT FAILURES

None. All reviewer agents completed successfully.
