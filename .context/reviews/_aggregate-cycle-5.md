# Aggregate Review — Cycle 5 (RPF Loop)

**Date:** 2026-05-11
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, test-engineer (orchestrator direct)
**Scope:** Judge polling, SSE events, code snapshots, recruiting invitations, restore route, database queries

---

## New Findings Summary (This Cycle)

| Severity | Count |
|----------|-------|
| MEDIUM   | 1     |
| LOW      | 5     |
| **Total**| **6** |

---

## MEDIUM

### M1: `buildCodeSnapshotDiff` O(n×m) Memory Can Exhaust Heap on Large Files
- **File:** `src/lib/code-snapshots/diff.ts:28-30`
- **Reviewer:** code-reviewer, perf-reviewer
- **Confidence:** High
- **Description:** The LCS diff algorithm allocates a full `(n+1) × (m+1)` integer matrix. For files with 5,000+ lines, this creates ~25M integers (~200MB). At 10K lines it's ~100M integers (~800MB). In production with concurrent diffs or limited heap, this triggers OOM crashes.
- **Fix:** Space-optimized LCS using two rolling rows (O(min(n,m)) memory).

---

## LOW

### L1: `buildCodeSnapshotDiff` and Related Types Are Dead Code
- **File:** `src/lib/code-snapshots/diff.ts`
- **Reviewer:** code-reviewer, test-engineer
- **Confidence:** High
- **Description:** Exported but never imported by any module or test. Unmaintained dead code with no tests.
- **Fix:** Remove the file, or add tests and document intended usage if kept for a planned feature.

### L2: `getDbNowUncached()` Extends Transaction Duration in Judge/Poll
- **File:** `src/app/api/v1/judge/poll/route.ts:82`
- **Reviewer:** code-reviewer, perf-reviewer
- **Confidence:** Medium
- **Description:** `getDbNowUncached()` executes `SELECT NOW()` as a separate DB query inside a transaction that already holds row-level locks. Extends lock duration and increases contention.
- **Fix:** Call before entering the transaction, or use a `sql` expression inside the UPDATE.

### L3: `file.type` Is Client-Controlled in Restore Route ZIP Detection
- **File:** `src/app/api/v1/admin/restore/route.ts:74-77`
- **Reviewer:** security-reviewer
- **Confidence:** Medium
- **Description:** `isZipFile` uses `file.type` which comes from the multipart Content-Type header and can be spoofed. Could cause wasted CPU/memory on non-ZIP files.
- **Fix:** Remove `file.type` from ZIP detection; rely only on `file.name?.endsWith(".zip")`.

### L4: Missing `sharedPollTimer` Cleanup on Server Shutdown
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:181-210`
- **Reviewer:** perf-reviewer
- **Confidence:** Medium
- **Description:** No exported function to stop `sharedPollTimer`. On graceful shutdown, the timer keeps the process alive until it fires again.
- **Fix:** Export `stopSharedPollTimer()` and call it from the shutdown handler.

### L5: `isomorphic-dompurify` Dependency Should Be Audited
- **File:** `src/lib/security/sanitize-html.ts`
- **Reviewer:** security-reviewer
- **Confidence:** Low
- **Description:** DOMPurify has had CVEs in the past. Current version should be verified safe.
- **Fix:** Run `npm audit` for `isomorphic-dompurify`.

---

## Cross-Agent Agreement

- **M1** flagged by both code-reviewer and perf-reviewer (higher signal).
- **L1** flagged by both code-reviewer and test-engineer.

---

## Recommended Priority for Fixes

1. **Immediate:** M1 (`buildCodeSnapshotDiff` OOM) — real crash risk under load.
2. **Short-term:** L1 (dead code removal) — zero risk, reduces maintenance burden.
3. **Short-term:** L3 (restore ZIP detection) — defense-in-depth.
4. **Medium-term:** L2 (transaction lock contention) — performance under load.
5. **Medium-term:** L4 (SSE timer cleanup) — graceful shutdown hygiene.
6. **Trivial:** L5 (dependency audit) — run `npm audit`.
