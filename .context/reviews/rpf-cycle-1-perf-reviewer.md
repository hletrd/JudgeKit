# Performance Review — RPF Cycle 1 (2026-05-01)

**Reviewer:** perf-reviewer
**HEAD reviewed:** `894320ff`
**Scope:** Hot paths, render cost, bundle size, query parallelism

---

## Findings

### C1-PR-1: [LOW] Polling intervals not visibility-paused

- **File:** `src/hooks/use-submission-polling.ts`, `src/hooks/use-visibility-polling.ts`, `src/components/submission-list-auto-refresh.tsx`
- **Confidence:** MEDIUM
- **Description:** `setInterval`/`setTimeout` exist in real-time submission status, leaderboard updates, exam timers. No global pause when document is hidden. Background tabs still consume polling cycles.
- **Fix:** Defer; candidate for visibility-based pause once usage telemetry shows it matters. Already tracked as C2-AGG-5 in deferred backlog.

### C1-PR-2: [LOW] `getAssignmentStatusRows` performs 4 sequential DB queries

- **File:** `src/lib/assignments/submissions.ts:483-601`
- **Confidence:** MEDIUM
- **Description:** The function runs 4 DB queries sequentially: assignment lookup, assignment problems, enrolled students, and a raw SQL aggregation. The first 3 could run in parallel since they have no data dependency on each other (they all depend only on `assignmentId`). This is especially impactful for large groups.
- **Fix:** Use `Promise.all` for the 3 independent queries. The raw SQL aggregation depends on `assignment.deadline` and `assignment.latePenalty` from the first query, so it must remain sequential.

---

## No-issue confirmations

- `Promise.all` parallelism in `src/app/layout.tsx` is correct.
- Client component count (149 "use client") is healthy for an SSR-first Next.js 16 app.
- Rate limiting uses `SELECT FOR UPDATE` transactions to prevent TOCTOU races. Correct.
- Compiler execution uses `pLimit` for concurrency control. Correct.
