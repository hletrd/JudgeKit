# Performance Review — RPF Cycle 2 (2026-05-04)

**Reviewer:** perf-reviewer
**HEAD reviewed:** `767b1fee`
**Scope:** Hot paths, render cost, query parallelism, recent changes

---

## Recent changes performance audit

### Code similarity `performance.now()` (commit `7f29d897`)
- **File:** `src/lib/assignments/code-similarity.ts:281,302`
- **Status:** IMPROVED — Monotonic `performance.now()` replaces `Date.now()` for yield timing. Avoids NTP clock-adjustment jumps. Correct.

### Discussions SQL filter push-down (commit `82e1ea9e`)
- **File:** `src/lib/discussions/data.ts:260-299`
- **Status:** IMPROVED — Scope and state filters now pushed to SQL WHERE clause instead of post-fetch JS filtering. Leverages `dt_scope_idx` index. Reduces DB I/O.

---

## Findings

### C2-PR-1: [LOW] `getAssignmentStatusRows` performs 4 sequential DB queries

- **File:** `src/lib/assignments/submissions.ts:483-601`
- **Confidence:** MEDIUM (carry-forward from C1-PR-2)
- **Description:** 4 DB queries run sequentially. First 3 could be parallelized with `Promise.all` since they depend only on `assignmentId`.
- **Status:** Carry-forward. No regression.

### C2-PR-2: [LOW] Polling intervals not visibility-paused

- **File:** `src/hooks/use-submission-polling.ts`, `src/hooks/use-visibility-polling.ts`
- **Confidence:** MEDIUM (carry-forward from C1-PR-1)
- **Description:** `setInterval`/`setTimeout` in real-time components not paused when document hidden.
- **Status:** Carry-forward. No regression.

---

## No-issue confirmations

- `Promise.all` parallelism in `src/app/layout.tsx` is correct.
- Rate limiting uses `SELECT FOR UPDATE` transactions. Correct.
- Compiler execution uses `pLimit` for concurrency control. Correct.
- Client component count (149 "use client") is healthy for SSR-first Next.js 16.
