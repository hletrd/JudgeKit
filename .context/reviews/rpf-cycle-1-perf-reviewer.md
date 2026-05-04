# Performance Review — RPF Cycle 3 (2026-05-04)

**Reviewer:** perf-reviewer
**HEAD reviewed:** `4cd03c2b`
**Scope:** Hot paths, render cost, bundle size, query parallelism. Focus on changes since `988435b5`.

---

## Prior cycle status

- **C1-PR-1 (polling intervals not visibility-paused):** CARRY — still deferred.
- **C1-PR-2 (sequential DB queries in getAssignmentStatusRows):** CARRY — still deferred.

---

## Findings

### C3-PR-1: [LOW] `listModerationDiscussionThreads` fetches all columns for filtered results

- **File:** `src/lib/discussions/data.ts:289-298`
- **Confidence:** LOW
- **Description:** The moderation query now correctly filters by scope and state at the SQL level (good improvement from cycle 12b). However, it still fetches all columns including `content` (which can be large) even though the moderation UI may only need thread metadata. With `limit: 100`, this could be significant for threads with large content.
- **Fix:** Consider selecting only the columns needed by the moderation view. Deferred — low impact, the limit is reasonable.

---

## No-issue confirmations

- `performance.now()` migration in `src/lib/assignments/code-similarity.ts` is correct and monotonic. Good improvement.
- `Promise.all` parallelism in dashboard layout and other server components remains correct.
- The SQL-level filtering in `listModerationDiscussionThreads` is a good performance improvement over the previous JS-level filtering.
- Rate limiting, compiler concurrency control, and query patterns all remain correct.
